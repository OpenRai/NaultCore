.DEFAULT_GOAL := help

.PHONY: help wallet-dev

help:
	@echo "Targets:"
	@echo "  wallet-dev  Start the local wallet development server on 127.0.0.1:4200"

wallet-dev:
	pnpm run version && pnpm exec ng serve --host 127.0.0.1
