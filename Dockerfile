FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose port
EXPOSE 8080

# Set environment variable for Vite to enable polling
ENV CHOKIDAR_USEPOLLING=true
ENV VITE_HOST=0.0.0.0

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]