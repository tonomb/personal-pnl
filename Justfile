# This Justfile isn't strictly necessary, but it's
# a convenient way to run commands in the repo
# without needing to remember all commands.

[private]
@help:
  just --list

# Aliases
alias new-pkg := new-package
alias new-worker := gen
alias up := update
alias i := install

# =============================== #
#         DEV COMMANDS            #
# =============================== #

# Install dependencies
[group('1. dev')]
install:
  pnpm install --child-concurrency=10

# Check for issues with deps, lint, types, format, etc.
[group('1. dev')]
[positional-arguments]
[no-cd]
check *args:
  pnpm exec runx check "$@"

# Fix issues with deps, lint, format, etc.
[group('1. dev')]
[positional-arguments]
[no-cd]
fix *args:
  pnpm exec runx fix "$@"

[group('1. dev')]
[positional-arguments]
[no-cd]
test *args:
  pnpm exec vitest "$@"

[group('1. dev')]
[positional-arguments]
[no-cd]
build *args:
  pnpm exec turbo build "$@"

# =============================== #
#       LOCAL DEV COMMANDS        #
# =============================== #

# Run dev script. Runs turbo dev if not in a specific project directory.
[group('2. local dev')]
[positional-arguments]
[no-cd]
dev *args:
  pnpm exec runx dev "$@"

# Run Workers in preview mode (if available)
[group('2. local dev')]
[no-cd]
preview:
  pnpm run preview

# Deploy Workers
[group('2. local dev')]
[positional-arguments]
[no-cd]
deploy *args:
  pnpm exec turbo deploy "$@"

# =============================== #
#       GENERATOR COMMANDS        #
# =============================== #

# Create changeset
[group('3. generator')]
cs:
  pnpm exec run-changeset-new

[group('3. generator')]
[positional-arguments]
gen *args:
  pnpm exec turbo gen "$@"

[group('3. generator')]
[positional-arguments]
new-package *args:
  pnpm exec turbo gen new-package "$@"

# =============================== #
#        UTILITY COMMANDS         #
# =============================== #

# CLI in packages/tools for updating deps, pnpm, etc.
[group('4. utility')]
[positional-arguments]
update *args:
  pnpm exec runx update "$@"

# CLI in packages/tools for running commands in the repo.
[group('4. utility')]
[positional-arguments]
runx *args:
  pnpm exec runx "$@"
