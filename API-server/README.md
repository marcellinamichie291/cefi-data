# API-server

### Installation process

1. Clone the project
2. Launch Docker
3. Build & run containers
```
docker-compose up -d --build
```
4. If one of the containers failed, just rerun it when other containers finish to build


### Development process

We use ts-node execution engine, so when you write the code it will rebuild directly in the container

### Testing

Right now, we have 3 different namespaces:
- /cex. Is used to fetch token prices from CEXs
- /defi_address. Allows to fetch address related infos (fetching from Zerion API)
- /defi_assets. Allows to fetch assets infos (Zerion API)

First, run all services in Docker and call the server in Postman at localhost:7777:
``` 
ws://localhost:7777/cex?token=cede.link-4adacb6b75d274aa45322413301e52fc
```
Instead of connect button, compose this message:
```
{
    "query":"prices",
    "payload":["BTC","XRP","TRX"]
}
```
And hit **Send**

### Futher steps

Right now we're migrating to the AWS infra, so this code has to be completely refactored
