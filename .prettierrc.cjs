/** @type {import("prettier").Config} */
module.exports = {
	useTabs: false,
	singleQuote: false,
	endOfLine: "lf",
	trailingComma: "none",
	printWidth: 120,
	tabWidth: 2,
	semi: true,
	arrowParens: "always",
	bracketSpacing: true,
	overrides: [
		{
			files: "*.svelte",
			options: {
				parser: "svelte"
			}
		}
	]
}
