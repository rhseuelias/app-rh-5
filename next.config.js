/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // aumenta o limite padrão (1mb) das server actions pra caber os
    // documentos anexados no pré-cadastro do candidato (RG, CTPS, foto etc.)
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

module.exports = nextConfig;
