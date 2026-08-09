import {
  AlibabaMark,
  AnthropicMark,
  CopilotMark,
  CustomEndpointMark,
  GeminiMark,
  HuggingFaceMark,
  MiniMaxMark,
  NvidiaMark,
  OllamaMark,
  OpenAIMark,
  OpenRouterMark,
  XaiMark,
  XiaomiMark,
} from "~/components/brand-icons";
import type { BrandMark } from "~/components/brand-icons";

/**
 * The model providers the Hermes runtime can connect to, mirrored from its
 * `plugins/model-providers/*` definitions (base URLs + auth types). This is the
 * catalog both onboarding and settings render — one source of truth, two views.
 *
 * `methods` is per-provider on purpose: OpenAI signs in with ChatGPT OR takes a
 * key; most are key-only; Ollama is local and needs neither. `signinSoon` marks
 * a provider whose sign-in Hermes supports but whose OAuth AULAR hasn't wired
 * yet — its key method works today, the sign-in lands when core-api grows it.
 *
 * Default model ids are sensible starting points and stay editable in the form.
 */
export type ConnectMethod = "codex" | "key" | "local";

export interface ModelProvider {
  id: string;
  name: string;
  hint: string;
  base_url: string;
  api_mode: string;
  model: string;
  methods: ConnectMethod[];
  signinSoon?: boolean;
  logo?: BrandMark;
  /** Tint for the monogram fallback when a provider has no logo asset. */
  accent?: string;
  /** Shown on the first screen; the rest live behind "Show all". */
  featured?: boolean;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    hint: "Sign in with ChatGPT, or use an API key",
    base_url: "https://api.openai.com/v1",
    api_mode: "chat_completions",
    model: "gpt-4o-mini",
    methods: ["codex", "key"],
    logo: OpenAIMark,
    featured: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    hint: "Claude — sign-in or API key",
    base_url: "https://api.anthropic.com",
    api_mode: "anthropic",
    model: "claude-sonnet-4",
    methods: ["key"],
    signinSoon: true,
    logo: AnthropicMark,
    featured: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    hint: "Gemini models",
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    api_mode: "chat_completions",
    model: "gemini-2.0-flash",
    methods: ["key"],
    logo: GeminiMark,
    featured: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    hint: "One key, every model",
    base_url: "https://openrouter.ai/api/v1",
    api_mode: "chat_completions",
    model: "deepseek/deepseek-chat",
    methods: ["key"],
    logo: OpenRouterMark,
    featured: true,
  },
  {
    id: "xai",
    name: "xAI · Grok",
    hint: "Grok models",
    base_url: "https://api.x.ai/v1",
    api_mode: "chat_completions",
    model: "grok-2-latest",
    methods: ["key"],
    logo: XaiMark,
    featured: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    hint: "deepseek-chat · reasoner",
    base_url: "https://api.deepseek.com/v1",
    api_mode: "chat_completions",
    model: "deepseek-chat",
    methods: ["key"],
    accent: "#4D6BFE",
    featured: true,
  },
  {
    id: "ollama",
    name: "Local · Ollama",
    hint: "Runs on this machine — no key",
    base_url: "http://localhost:11434/v1",
    api_mode: "chat_completions",
    model: "qwen3:8b",
    methods: ["local"],
    logo: OllamaMark,
    featured: true,
  },
  {
    id: "nous",
    name: "Nous Research",
    hint: "Hermes models",
    base_url: "https://inference.nousresearch.com/v1",
    api_mode: "chat_completions",
    model: "Hermes-4-70B",
    methods: ["key"],
    signinSoon: true,
    accent: "#111114",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    hint: "Nemotron",
    base_url: "https://integrate.api.nvidia.com/v1",
    api_mode: "chat_completions",
    model: "nvidia/llama-3.1-nemotron-70b-instruct",
    methods: ["key"],
    logo: NvidiaMark,
    featured: true,
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    hint: "Router · open models",
    base_url: "https://router.huggingface.co/v1",
    api_mode: "chat_completions",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    methods: ["key"],
    logo: HuggingFaceMark,
    featured: true,
  },
  {
    id: "minimax",
    name: "MiniMax",
    hint: "MiniMax models",
    base_url: "https://api.minimax.io/anthropic",
    api_mode: "anthropic",
    model: "MiniMax-M1",
    methods: ["key"],
    logo: MiniMaxMark,
    featured: true,
  },
  {
    id: "alibaba",
    name: "Alibaba · Qwen",
    hint: "Qwen models",
    base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    api_mode: "chat_completions",
    model: "qwen-max",
    methods: ["key"],
    logo: AlibabaMark,
  },
  {
    id: "kimi",
    name: "Kimi · Moonshot",
    hint: "Moonshot models",
    base_url: "https://api.moonshot.ai/v1",
    api_mode: "chat_completions",
    model: "kimi-k2-0711-preview",
    methods: ["key"],
    accent: "#16162A",
  },
  {
    id: "zai",
    name: "Z.AI · GLM",
    hint: "GLM models",
    base_url: "https://api.z.ai/api/paas/v4",
    api_mode: "chat_completions",
    model: "glm-4.6",
    methods: ["key"],
    accent: "#3B82F6",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    hint: "Copilot subscription",
    base_url: "https://api.githubcopilot.com",
    api_mode: "chat_completions",
    model: "gpt-4o",
    methods: ["key"],
    signinSoon: true,
    logo: CopilotMark,
  },
  {
    id: "xiaomi",
    name: "Xiaomi MiMo",
    hint: "MiMo models",
    base_url: "https://api.xiaomimimo.com/v1",
    api_mode: "chat_completions",
    model: "mimo-7b-rl",
    methods: ["key"],
    logo: XiaomiMark,
  },
  {
    id: "custom",
    name: "Custom endpoint",
    hint: "Any OpenAI-compatible URL",
    base_url: "",
    api_mode: "chat_completions",
    model: "",
    methods: ["key", "local"],
    logo: CustomEndpointMark,
  },
];
