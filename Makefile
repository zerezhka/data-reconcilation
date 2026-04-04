.PHONY: up down build run dev clean

# Docker
up:
	docker-compose up -d
	@echo "✅ PostgreSQL: localhost:5432 (recon/recon123, db: source_of_truth)"
	@echo "✅ ClickHouse: localhost:8123 (recon/recon123, db: analytics)"

down:
	docker-compose down

reset: down
	docker volume rm data-reconciler_pg_data data-reconciler_ch_data 2>/dev/null || true
	$(MAKE) up

# Go backend
build:
	go build -o bin/reconciler ./cmd/server

run: build
	./bin/reconciler -port 8080

# Development (with hot reload if air is installed)
dev:
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "💡 Install 'air' for hot reload: go install github.com/air-verse/air@latest"; \
		$(MAKE) run; \
	fi

clean:
	rm -rf bin/
	docker-compose down -v
