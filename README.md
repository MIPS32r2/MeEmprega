# 💼 MeEmprega

Script em **Node.js** para buscar **vagas reais do LinkedIn** usando a API pública de listagem (`/jobs/api/seeMoreJobPostings/search`).

Permite filtrar por:
- 🔍 Palavra-chave (ex: linux, devops)
- 📍 Localidade (ex: Goiânia, Brazil)
- ⏱️ Período (últimas 24h, semana ou mês)

Os resultados são exibidos no terminal e também exportados para um arquivo `vagas_reais.json`.

---

## 🧩 Requisitos

Antes de tudo, instale:

- [Node.js](https://nodejs.org) (versão **18+**)
- [npm](https://www.npmjs.com/)

---

## ⚙️ Instalação

```bash
git clone https://github.com/MIPS32r2/MeEmprega.git
cd MeEmprega
npm install
npm start
