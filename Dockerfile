# -------- BUILD STAGE --------
FROM node:20-bullseye AS builder

WORKDIR /app

COPY package*.json ./

# 🔥 Skip prisma generate here
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .

# ✅ Run after schema is available
RUN npx prisma generate
RUN npm run build

# -------- RUNTIME STAGE --------
FROM node:20-bullseye

WORKDIR /app

COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "start"]
