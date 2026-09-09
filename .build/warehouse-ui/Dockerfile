# Use an official Node.js runtime as a parent image
FROM node:22-alpine AS build

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the application
RUN npm run build

# Use a lightweight Node.js image to serve the application
FROM node:22-alpine

# Set the working directory to /app
WORKDIR /app

# Install the 'serve' package to serve the build files
RUN npm install -g serve

# Copy the build files from the previous stage
COPY --from=build /app/dist ./dist

# Expose port
EXPOSE 5175

# Serve the application on port 
CMD ["serve", "-s", "dist", "-l", "5175"]
