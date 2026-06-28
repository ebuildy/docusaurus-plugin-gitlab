import Joi from "joi";

export interface GitlabThemeOptions {
  /** Inject the polished card theme. Default: true. */
  theme?: boolean;
}

export interface ResolvedTheme {
  enabled: boolean;
}

/** Private CSS variables the theme defines and the component CSS consumes. */
export const GL_CARD_VARS = [
  "--gl-card-bg",
  "--gl-card-border",
  "--gl-card-radius",
  "--gl-card-shadow",
  "--gl-card-accent",
  "--gl-card-badge-bg",
] as const;

const schema = Joi.object({
  theme: Joi.boolean().optional(),
});

export function resolveTheme(input: GitlabThemeOptions | undefined): ResolvedTheme {
  const { error, value } = schema.validate(input ?? {}, { abortEarly: false });
  if (error) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: invalid theme options — ${error.message}`,
    );
  }
  return { enabled: (value as GitlabThemeOptions).theme ?? true };
}

export function renderThemeCss(): string {
  return `:root {
  --gl-card-bg: var(--ifm-background-surface-color);
  --gl-card-border: var(--ifm-color-emphasis-200);
  --gl-card-radius: 10px;
  --gl-card-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.04);
  --gl-card-accent: var(--ifm-color-primary);
  --gl-card-badge-bg: var(--ifm-color-emphasis-100);
}
[data-theme='dark'] {
  /* Most vars resolve to --ifm-* tokens that already swap per theme; only shadow
     and border need a dark-specific tweak. */
  --gl-card-border: var(--ifm-color-emphasis-300);
  --gl-card-shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 2px 10px rgb(0 0 0 / 0.25);
}
`;
}
