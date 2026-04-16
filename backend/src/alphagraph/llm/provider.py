from __future__ import annotations

import json
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Mapping, Protocol
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from openai import OpenAI
from pydantic import BaseModel

from alphagraph.runtime.backtest_engine import evaluate_execution
from alphagraph.schemas import (
    CodegenOutput,
    CriticOutput,
    Critique,
    EvaluationResult,
    ExecutionResult,
    FactorSpec,
    GeneratedCode,
    HypothesisOutput,
    NeutralizationMode,
    StrategyConfig,
)


class ProviderKind(str, Enum):
    DEMO = "demo"
    OPENAI = "openai"
    GOOGLE = "google"
    ANTHROPIC = "anthropic"
    DEEPSEEK = "deepseek"


class RoleName(str, Enum):
    HYPOTHESIS = "hypothesis"
    CODING = "coding"
    CRITIC = "critic"


@dataclass(frozen=True)
class RoleRoute:
    role: RoleName
    provider: ProviderKind
    model: str
    api_key_env: str | None


@dataclass(frozen=True)
class AgentRoutes:
    hypothesis: RoleRoute
    coding: RoleRoute
    critic: RoleRoute


class LLMProvider(Protocol):
    def generate_factor(
        self,
        *,
        brief: str,
        attempt_number: int,
        critique: Critique | None,
    ) -> FactorSpec: ...

    def generate_code(
        self,
        *,
        factor_spec: FactorSpec,
        strategy_config: StrategyConfig | None,
        attempt_number: int,
        dataset_profile: dict | None,
    ) -> GeneratedCode: ...

    def generate_critique(
        self,
        *,
        factor_spec: FactorSpec,
        evaluation: EvaluationResult,
        attempt_number: int,
    ) -> Critique: ...


class HypothesisAgent(Protocol):
    def propose(
        self,
        *,
        brief: str,
        attempt_number: int,
        prior_critique: Critique | None,
    ) -> HypothesisOutput: ...


class CodingAgent(Protocol):
    def translate(
        self,
        *,
        hypothesis: HypothesisOutput,
        strategy_config: StrategyConfig | None,
        attempt_number: int,
        dataset_profile: dict | None,
    ) -> CodegenOutput: ...


class FactorCriticAgent(Protocol):
    def review(
        self,
        *,
        hypothesis: HypothesisOutput,
        execution_result: ExecutionResult,
        attempt_number: int,
    ) -> CriticOutput: ...


@dataclass(frozen=True)
class AgentSuite:
    hypothesis_agent: HypothesisAgent
    coding_agent: CodingAgent
    factor_critic: FactorCriticAgent


class DemoLLMProvider:
    provider_name = ProviderKind.DEMO
    model = "demo-seeded"

    def generate_factor(
        self,
        *,
        brief: str,
        attempt_number: int,
        critique: Critique | None,
    ) -> FactorSpec:
        if attempt_number == 1:
            return FactorSpec(
                name="Cross-Sectional Price Level",
                thesis="Higher-priced stocks might keep outperforming in the very short term.",
                expression="rank(close)",
            )
        return FactorSpec(
            name="Five-Day Momentum",
            thesis="Recent winners should continue outperforming over the next day.",
            expression="rank(ts_return(close, 5))",
        )

    def generate_code(
        self,
        *,
        factor_spec: FactorSpec,
        strategy_config: StrategyConfig | None = None,
        attempt_number: int,
        dataset_profile: dict | None = None,
    ) -> GeneratedCode:
        config = strategy_config or StrategyConfig(
            expression=factor_spec.expression,
            neutralization=NeutralizationMode.NONE,
        )
        return GeneratedCode(
            commentary=(
                "Generated a minimal backtest script that runs the factor through "
                "the fixed AlphaGraph harness."
            ),
            script=_script_template(config),
        )

    def generate_critique(
        self,
        *,
        factor_spec: FactorSpec,
        evaluation: EvaluationResult,
        attempt_number: int,
    ) -> Critique:
        if "raw_price_level" in evaluation.reasons:
            return Critique(
                summary="The factor failed because it ranks stocks by raw price level.",
                root_cause="Raw prices are not stationary and are not comparable across securities.",
                revision_instructions=(
                    "Replace the raw price level with a stationary return-based signal, "
                    "preferably short-term momentum."
                ),
            )
        if evaluation.needs_revision:
            return Critique(
                summary="The factor is too weak for the demo thresholds.",
                root_cause="Sharpe or trade count missed the deterministic acceptance gates.",
                revision_instructions="Increase signal quality while staying inside the tiny DSL.",
            )
        return Critique(
            summary="The revised factor cleared the demo gates.",
            root_cause="The factor is now methodologically sound and strong enough for the demo.",
            revision_instructions="Present the result to a human reviewer before finalizing.",
        )


class PromptDrivenLLMProvider:
    provider_name: ProviderKind
    model: str

    def __init__(self, *, provider_name: ProviderKind, model: str, prompt_dir: Path) -> None:
        self.provider_name = provider_name
        self.model = model
        self.prompt_dir = prompt_dir

    def generate_factor(
        self,
        *,
        brief: str,
        attempt_number: int,
        critique: Critique | None,
    ) -> FactorSpec:
        guidance = critique.revision_instructions if critique else "Seed a naive first factor."
        return self._parse_json(
            FactorSpec,
            "hypothesis.md",
            f"Brief:\n{brief}\n\nAttempt: {attempt_number}\n\nGuidance:\n{guidance}",
        )

    def generate_code(
        self,
        *,
        factor_spec: FactorSpec,
        strategy_config: StrategyConfig | None = None,
        attempt_number: int,
        dataset_profile: dict | None = None,
    ) -> GeneratedCode:
        parts = [
            "Write a runnable Python script for this factor.",
            f"Attempt: {attempt_number}",
            f"Factor JSON:\n{factor_spec.model_dump_json(indent=2)}",
        ]
        if strategy_config:
            parts.append(f"Strategy Config:\n{strategy_config.model_dump_json(indent=2)}")
        if dataset_profile:
            parts.append(f"Dataset Profile:\n{json.dumps(dataset_profile, indent=2, default=str)}")
        return self._parse_json(GeneratedCode, "codegen.md", "\n\n".join(parts))

    def generate_critique(
        self,
        *,
        factor_spec: FactorSpec,
        evaluation: EvaluationResult,
        attempt_number: int,
    ) -> Critique:
        return self._parse_json(
            Critique,
            "critic.md",
            (
                f"Attempt: {attempt_number}\n"
                f"Factor JSON:\n{factor_spec.model_dump_json(indent=2)}\n\n"
                f"Evaluation JSON:\n{evaluation.model_dump_json(indent=2)}"
            ),
        )

    def _parse_json(
        self,
        schema: type[BaseModel],
        prompt_name: str,
        user_input: str,
    ):
        prompt = (self.prompt_dir / prompt_name).read_text()
        raw = self._complete(
            system_prompt=_build_json_prompt(prompt, schema),
            user_input=user_input,
        )
        return schema.model_validate(_extract_json_payload(raw))

    def _complete(self, *, system_prompt: str, user_input: str) -> str:
        raise NotImplementedError


class OpenAICompatibleLLMProvider(PromptDrivenLLMProvider):
    def __init__(
        self,
        *,
        provider_name: ProviderKind,
        model: str,
        prompt_dir: Path,
        api_key: str,
        base_url: str | None = None,
    ) -> None:
        super().__init__(provider_name=provider_name, model=model, prompt_dir=prompt_dir)
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def _complete(self, *, system_prompt: str, user_input: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
        )
        content = response.choices[0].message.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            return "\n".join(part for part in parts if part)
        raise ValueError(f"{self.provider_name.value} returned no text content.")


class AnthropicLLMProvider(PromptDrivenLLMProvider):
    def __init__(
        self,
        *,
        model: str,
        prompt_dir: Path,
        api_key: str,
    ) -> None:
        super().__init__(
            provider_name=ProviderKind.ANTHROPIC,
            model=model,
            prompt_dir=prompt_dir,
        )
        self.api_key = api_key

    def _complete(self, *, system_prompt: str, user_input: str) -> str:
        request = Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(
                {
                    "model": self.model,
                    "max_tokens": 2048,
                    "temperature": 0.2,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_input}],
                }
            ).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise ValueError(f"anthropic request failed: {body}") from exc
        blocks = payload.get("content", [])
        text_parts = [
            block.get("text", "")
            for block in blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        if not text_parts:
            raise ValueError("anthropic returned no text content.")
        return "\n".join(part for part in text_parts if part)


class ResilientLLMProvider:
    def __init__(
        self,
        *,
        primary: LLMProvider | None,
        fallback: DemoLLMProvider | None = None,
    ) -> None:
        self.primary = primary
        self.fallback = fallback or DemoLLMProvider()

    def generate_factor(
        self,
        *,
        brief: str,
        attempt_number: int,
        critique: Critique | None,
    ) -> FactorSpec:
        if self.primary is None:
            return self.fallback.generate_factor(
                brief=brief,
                attempt_number=attempt_number,
                critique=critique,
            )
        try:
            return self.primary.generate_factor(
                brief=brief,
                attempt_number=attempt_number,
                critique=critique,
            )
        except Exception:
            return self.fallback.generate_factor(
                brief=brief,
                attempt_number=attempt_number,
                critique=critique,
            )

    def generate_code(
        self,
        *,
        factor_spec: FactorSpec,
        strategy_config: StrategyConfig | None = None,
        attempt_number: int,
        dataset_profile: dict | None = None,
    ) -> GeneratedCode:
        kwargs = dict(
            factor_spec=factor_spec,
            strategy_config=strategy_config,
            attempt_number=attempt_number,
            dataset_profile=dataset_profile,
        )
        if self.primary is None:
            return self.fallback.generate_code(**kwargs)
        try:
            return self.primary.generate_code(**kwargs)
        except Exception:
            return self.fallback.generate_code(**kwargs)

    def generate_critique(
        self,
        *,
        factor_spec: FactorSpec,
        evaluation: EvaluationResult,
        attempt_number: int,
    ) -> Critique:
        if self.primary is None:
            return self.fallback.generate_critique(
                factor_spec=factor_spec,
                evaluation=evaluation,
                attempt_number=attempt_number,
            )
        try:
            return self.primary.generate_critique(
                factor_spec=factor_spec,
                evaluation=evaluation,
                attempt_number=attempt_number,
            )
        except Exception:
            return self.fallback.generate_critique(
                factor_spec=factor_spec,
                evaluation=evaluation,
                attempt_number=attempt_number,
            )


class ProviderBackedHypothesisAgent:
    def __init__(self, provider: ResilientLLMProvider) -> None:
        self.provider = provider

    def propose(
        self,
        *,
        brief: str,
        attempt_number: int,
        prior_critique: Critique | None,
    ) -> HypothesisOutput:
        factor_spec = self.provider.generate_factor(
            brief=brief,
            attempt_number=attempt_number,
            critique=prior_critique,
        )
        return HypothesisOutput(factor_spec=factor_spec)


class ProviderBackedCodingAgent:
    def __init__(self, provider: ResilientLLMProvider) -> None:
        self.provider = provider

    def translate(
        self,
        *,
        hypothesis: HypothesisOutput,
        strategy_config: StrategyConfig | None = None,
        attempt_number: int,
        dataset_profile: dict | None = None,
    ) -> CodegenOutput:
        resolved_config = strategy_config or StrategyConfig(
            expression=hypothesis.factor_spec.expression,
            neutralization=NeutralizationMode.NONE,
        )
        generated_code = self.provider.generate_code(
            factor_spec=hypothesis.factor_spec,
            strategy_config=resolved_config,
            attempt_number=attempt_number,
            dataset_profile=dataset_profile,
        )
        # Use the LLM-generated script as-is. The coding agent sees the real
        # dataset profile and is responsible for writing code that works with it.
        return CodegenOutput(
            strategy_config=resolved_config,
            generated_code=generated_code,
        )


class ProviderBackedFactorCritic:
    def __init__(self, provider: ResilientLLMProvider) -> None:
        self.provider = provider

    def review(
        self,
        *,
        hypothesis: HypothesisOutput,
        execution_result: ExecutionResult,
        attempt_number: int,
    ) -> CriticOutput:
        evaluation = evaluate_execution(
            expression=hypothesis.factor_spec.expression,
            execution=execution_result,
        )
        critique = self.provider.generate_critique(
            factor_spec=hypothesis.factor_spec,
            evaluation=evaluation,
            attempt_number=attempt_number,
        )
        return CriticOutput(
            evaluation=evaluation,
            critique=critique,
            needs_revision=evaluation.needs_revision,
        )


def build_agent_suite(provider: LLMProvider) -> AgentSuite:
    resilient_provider = ResilientLLMProvider(primary=provider)
    return AgentSuite(
        hypothesis_agent=ProviderBackedHypothesisAgent(resilient_provider),
        coding_agent=ProviderBackedCodingAgent(resilient_provider),
        factor_critic=ProviderBackedFactorCritic(resilient_provider),
    )


def build_agent_routes_from_env(env: Mapping[str, str] | None = None) -> AgentRoutes:
    values = env or os.environ
    return AgentRoutes(
        hypothesis=_build_role_route(values, RoleName.HYPOTHESIS),
        coding=_build_role_route(values, RoleName.CODING),
        critic=_build_role_route(values, RoleName.CRITIC),
    )


def build_default_agent_suite(prompt_dir: Path) -> AgentSuite:
    env = os.environ
    routes = build_agent_routes_from_env(env)

    hypothesis_provider = ResilientLLMProvider(
        primary=_build_provider_for_route(routes.hypothesis, prompt_dir, env)
    )
    coding_provider = ResilientLLMProvider(
        primary=_build_provider_for_route(routes.coding, prompt_dir, env)
    )
    critic_provider = ResilientLLMProvider(
        primary=_build_provider_for_route(routes.critic, prompt_dir, env)
    )

    return AgentSuite(
        hypothesis_agent=ProviderBackedHypothesisAgent(hypothesis_provider),
        coding_agent=ProviderBackedCodingAgent(coding_provider),
        factor_critic=ProviderBackedFactorCritic(critic_provider),
    )


def _build_role_route(values: Mapping[str, str], role: RoleName) -> RoleRoute:
    provider = _resolve_provider_kind(
        values.get(f"{role.value.upper()}_PROVIDER"),
        default=_default_provider_for_role(role),
    )
    model = _normalize_model_name(
        provider=provider,
        role=role,
        raw_model=values.get(f"{role.value.upper()}_MODEL"),
        env=values,
    )
    return RoleRoute(
        role=role,
        provider=provider,
        model=model,
        api_key_env=_api_key_env_for_provider(provider),
    )


def _default_provider_for_role(role: RoleName) -> ProviderKind:
    if role == RoleName.HYPOTHESIS:
        return ProviderKind.GOOGLE
    if role == RoleName.CODING:
        return ProviderKind.ANTHROPIC
    return ProviderKind.DEEPSEEK


def _resolve_provider_kind(raw_provider: str | None, *, default: ProviderKind) -> ProviderKind:
    if not raw_provider:
        return default
    normalized = raw_provider.strip().lower()
    aliases = {
        "gemini": ProviderKind.GOOGLE,
        "claude": ProviderKind.ANTHROPIC,
    }
    return aliases.get(normalized, ProviderKind(normalized))


def _default_model_for(
    provider: ProviderKind,
    role: RoleName,
    env: Mapping[str, str],
) -> str:
    if provider == ProviderKind.OPENAI:
        return env.get("OPENAI_MODEL", "gpt-4.1-mini")
    if provider == ProviderKind.GOOGLE:
        return "gemini-2.5-flash" if role == RoleName.HYPOTHESIS else "gemini-2.5-pro"
    if provider == ProviderKind.ANTHROPIC:
        return "claude-sonnet-4-6"
    if provider == ProviderKind.DEEPSEEK:
        return "deepseek-reasoner" if role == RoleName.CRITIC else "deepseek-chat"
    return DemoLLMProvider.model


def _normalize_model_name(
    *,
    provider: ProviderKind,
    role: RoleName,
    raw_model: str | None,
    env: Mapping[str, str],
) -> str:
    model = (raw_model or _default_model_for(provider, role, env)).strip()
    normalized = model.lower()

    if provider == ProviderKind.GOOGLE:
        aliases = {
            "gemini-pro": "gemini-2.5-pro",
            "gemini-flash": "gemini-2.5-flash",
            "gemini-flash-lite": "gemini-2.5-flash-lite",
        }
        return aliases.get(normalized, model)

    if provider == ProviderKind.ANTHROPIC:
        aliases = {
            "sonnet-4.6": "claude-sonnet-4-6",
            "sonnet-4-6": "claude-sonnet-4-6",
            "claude-sonnet-4.6": "claude-sonnet-4-6",
            "claude-sonnet-4": "claude-sonnet-4-6",
            "claude-sonnet-4-20250514": "claude-sonnet-4-6",
            "opus-4.6": "claude-opus-4-6",
            "claude-opus-4.6": "claude-opus-4-6",
            "haiku-4.5": "claude-haiku-4-5-20251001",
            "claude-haiku-4.5": "claude-haiku-4-5-20251001",
        }
        return aliases.get(normalized, model)

    if provider == ProviderKind.DEEPSEEK:
        aliases = {
            "deepseek-v3.2": "deepseek-reasoner" if role == RoleName.CRITIC else "deepseek-chat",
            "deepseek-v3-2": "deepseek-reasoner" if role == RoleName.CRITIC else "deepseek-chat",
            "deepseek-r1": "deepseek-reasoner",
        }
        return aliases.get(normalized, model)

    return model


def _api_key_env_for_provider(provider: ProviderKind) -> str | None:
    if provider == ProviderKind.OPENAI:
        return "OPENAI_API_KEY"
    if provider == ProviderKind.GOOGLE:
        return "GOOGLE_API_KEY"
    if provider == ProviderKind.ANTHROPIC:
        return "ANTHROPIC_API_KEY"
    if provider == ProviderKind.DEEPSEEK:
        return "DEEPSEEK_API_KEY"
    return None


def _build_provider_for_route(
    route: RoleRoute,
    prompt_dir: Path,
    env: Mapping[str, str],
) -> LLMProvider | None:
    if route.provider == ProviderKind.DEMO:
        return DemoLLMProvider()

    api_key = env.get(route.api_key_env) if route.api_key_env else None
    if not api_key:
        return None

    if route.provider == ProviderKind.OPENAI:
        return OpenAICompatibleLLMProvider(
            provider_name=ProviderKind.OPENAI,
            model=route.model,
            prompt_dir=prompt_dir,
            api_key=api_key,
        )
    if route.provider == ProviderKind.GOOGLE:
        return OpenAICompatibleLLMProvider(
            provider_name=ProviderKind.GOOGLE,
            model=route.model,
            prompt_dir=prompt_dir,
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
    if route.provider == ProviderKind.ANTHROPIC:
        return AnthropicLLMProvider(
            model=route.model,
            prompt_dir=prompt_dir,
            api_key=api_key,
        )
    if route.provider == ProviderKind.DEEPSEEK:
        return OpenAICompatibleLLMProvider(
            provider_name=ProviderKind.DEEPSEEK,
            model=route.model,
            prompt_dir=prompt_dir,
            api_key=api_key,
            base_url="https://api.deepseek.com",
        )
    return None


def _build_json_prompt(prompt: str, schema: type[BaseModel]) -> str:
    schema_json = json.dumps(schema.model_json_schema(), indent=2)
    return (
        f"{prompt.strip()}\n\n"
        "Return valid JSON only. Do not include markdown fences or prose.\n"
        "The response must validate against this JSON Schema:\n"
        f"{schema_json}"
    )


def _extract_json_payload(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        payload = json.loads(cleaned)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    for marker in ("{", "["):
        index = cleaned.find(marker)
        if index == -1:
            continue
        try:
            payload, _ = json.JSONDecoder().raw_decode(cleaned[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise ValueError("Model response did not contain a valid JSON object.")
def _script_template(config: StrategyConfig) -> str:
    return f"""from pathlib import Path
import os

from alphagraph.runtime.backtest_engine import run_backtest_from_expression


dataset_path = Path(os.environ[\"ALPHAGRAPH_DATASET_PATH\"])
output_path = Path(os.environ[\"ALPHAGRAPH_OUTPUT_PATH\"])
result = run_backtest_from_expression(
    dataset_path,
    {config.expression!r},
    neutralization={config.neutralization.value!r},
    transaction_cost_bps={config.transaction_cost_bps},
    long_quantile={config.long_quantile},
    short_quantile={config.short_quantile},
    is_ratio={config.is_ratio},
)
output_path.write_text(result.model_dump_json(indent=2))
print(\"executed factor {config.expression}\")
"""
