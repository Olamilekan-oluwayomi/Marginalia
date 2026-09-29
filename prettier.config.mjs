/**
 * Prettier configuration.
 *
 * These values match the conventions already used across the codebase
 * (2-space indent, double quotes, semicolons, trailing commas, 80 columns), so
 * adopting the formatter is a no-op on style rather than a re-style.
 *
 * Deliberately no `prettier-plugin-tailwindcss`: sorting class strings would
 * rewrite nearly every JSX file in the repo, which is a much larger and less
 * reviewable change than the rest of this formatting pass.
 */
const prettierConfig = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
};

export default prettierConfig;
