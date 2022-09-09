## Build docker image
.PHONY: docker-build
docker-build:
	docker build -t cerc-io/watcher-ts --build-arg NPM_AUTH_TOKEN=$(NPM_AUTH_TOKEN) .
