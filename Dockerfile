FROM python:3.10-slim

# Install system packages: ffmpeg, font libraries for Khmer UTF-8 text rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-khmeros \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Ensure storage directory exists with write permissions
RUN mkdir -p /app/media_storage && chmod -R 777 /app/media_storage

ENV PORT=7860
EXPOSE 7860

CMD ["python", "auto_srt_translator_api.py"]
