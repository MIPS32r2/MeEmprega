import readline from "readline";
import axios from "axios";
import fs from "fs";
import { JSDOM } from "jsdom";

// Função utilitária para input no terminal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

(async () => {
  console.log("🔍 Busca de vagas no LinkedIn");
  console.log("----------------------------------");

  const keyword = await ask("📌 Digite o termo da vaga (ex: linux, devops): ");
  const locationName = await ask("🌎 Digite a localidade (ex: Goiânia, Brazil): ");

  console.log("\n⏱️ Escolha o período:");
  console.log("1. Últimas 24 horas");
  console.log("2. Última semana");
  console.log("3. Último mês");
  const optPeriod = await ask("Selecione 1, 2 ou 3: ");

  console.log("\n🏠 Tipo de trabalho:");
  console.log("1. Remoto");
  console.log("2. Híbrido");
  console.log("3. Presencial");
  console.log("4. Qualquer um");
  const optWorkType = await ask("Selecione 1, 2, 3 ou 4: ");
  rl.close();

  const timeMap = { 1: "r86400", 2: "r604800", 3: "r2592000" };
  const f_TPR = timeMap[optPeriod] || "r86400";

  const workTypeMap = { 1: "1", 2: "2", 3: "3" };
  const f_WT = workTypeMap[optWorkType] || "";

  // -----------------------------------------------------------
  // 1️⃣ Obter automaticamente o geoId da localidade informada
  // -----------------------------------------------------------
  console.log(`\n🌐 Buscando geoId de "${locationName}"...`);

  let geoId = null;
  try {
    const suggestUrl = "https://www.linkedin.com/jobs-guest/api/typeaheadHits";
    const suggestRes = await axios.get(suggestUrl, {
      params: { keywords: locationName, origin: "JOBS_HOME_ORGANIC" },
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    const hits = suggestRes.data?.elements || [];
    const match = hits.find((el) => el?.type === "GEO");
    geoId = match?.targetUrn?.match(/(\d+)$/)?.[1];

    if (!geoId) throw new Error("geoId não encontrado.");
    console.log(`✅ geoId encontrado: ${geoId}`);
  } catch (err) {
    console.warn("⚠️ Não foi possível obter geoId automaticamente. Usando busca padrão.");
  }

  // -----------------------------------------------------------
  // 2️⃣ Buscar vagas reais no LinkedIn (HTML parsing com jsdom)
  // -----------------------------------------------------------
  console.log(`\n📡 Buscando vagas de "${keyword}" em ${locationName}...\n`);

  const baseUrl = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
  let start = 0;
  const allJobs = [];

  try {
    while (true) {
      const params = {
        keywords: keyword,
        f_TPR,
        start,
        ...(f_WT ? { f_WT } : {}),
        ...(geoId ? { geoId } : { location: locationName }),
      };

      const res = await axios.get(baseUrl, {
        params,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      if (!res.data || res.data.trim() === "") break; // Sem mais resultados
      const dom = new JSDOM(res.data);
      const document = dom.window.document;
      const cards = document.querySelectorAll(".base-card");

      if (!cards.length) break;

      const jobs = Array.from(cards).map((card) => {
        const title = card.querySelector(".base-search-card__title")?.textContent?.trim() || "";
        const company = card.querySelector(".base-search-card__subtitle")?.textContent?.trim() || "";
        const location = card.querySelector(".job-search-card__location")?.textContent?.trim() || "";
        const time = card.querySelector("time")?.getAttribute("datetime") || "";
        const url = card.querySelector("a.base-card__full-link")?.href?.split("?")[0] || "";
        return { title, company, location, time, url };
      });

      allJobs.push(...jobs);
      console.log(`📄 Página ${start / 25 + 1}: +${jobs.length} vagas`);
      start += 25; // Avança a paginação padrão
    }

    console.log(`\n🔎 Foram encontradas ${allJobs.length} vagas em ${locationName}:`);
    console.log("------------------------------------------------------------");

    allJobs.forEach((j, i) => {
      console.log(`${i + 1}. ${j.title} — ${j.company}`);
      console.log(`   📍 ${j.location}`);
      console.log(`   🕒 ${j.time}`);
      console.log(`   🔗 ${j.url}`);
      console.log("");
    });

    fs.writeFileSync("vagas_reais.json", JSON.stringify(allJobs, null, 2));
    console.log("💾 Vagas salvas em vagas_reais.json");
  } catch (err) {
    console.error("❌ Erro ao buscar vagas:", err.message);
  }
})();

