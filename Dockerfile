FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and frontend files
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

# Expose FastAPI port
EXPOSE 8000

# Set default run command
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
