#!/usr/bin/env bash
set -e

# Terminal output color definitions
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}==================================================${NC}"
echo -e "${CYAN}   Zepp Health Dashboard - Docker Orchestrator   ${NC}"
echo -e "${CYAN}==================================================${NC}"

# Check for Docker installation
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed on this system.${NC}"
    echo -e "Please install Docker to proceed: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose availability (V2 plugin or V1 binary)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}Error: Docker Compose is not installed on this system.${NC}"
    echo -e "Please install the Docker Compose plugin or binary."
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose environment verified.${NC}"

# Build and start container in the background
echo -e "${CYAN}Starting docker build and container initialization...${NC}"
$DOCKER_COMPOSE up -d --build

echo -e "${GREEN}✓ Dashboard container launched successfully!${NC}"
echo -e "Access the live application at: ${CYAN}http://localhost:8000${NC}"
echo -e ""
echo -e "Useful Commands:"
echo -e "  To inspect real-time logs:     ${YELLOW}$DOCKER_COMPOSE logs -f${NC}"
echo -e "  To stop the application:       ${YELLOW}$DOCKER_COMPOSE down${NC}"
echo -e "  To check container status:     ${YELLOW}$DOCKER_COMPOSE ps${NC}"
echo -e ""
