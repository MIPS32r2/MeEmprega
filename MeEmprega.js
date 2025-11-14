import readline from "readline";
import axios from "axios";
import fs from "fs";
import { JSDOM } from "jsdom";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const normalizeText = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

(async () => {
  console.log("🔍 Busca de vagas no LinkedIn");
  console.log("----------------------------------");

  const keywordInput = await ask("📌 Digite o termo da vaga (ex: linux, devops): ");

  // Valida o nome da cidade
  let locationName = "";
  do {
    locationName = await ask("🌎 Digite a localidade (ex: Goiânia, Brazil): ");
    if (!locationName.match(/[a-zA-Z]/)) {
      console.log("⚠️ Atenção: digite pelo menos uma letra válida para a cidade.");
      locationName = "";
      continue;
    } else if (!locationName.match(/[À-ÿ]/)) {
      console.log("ℹ️ Atenção: se a cidade oficial tiver acento, digite corretamente (ex: 'Goiânia').");
    }

    // pergunta se o caba tem certeza
    const confirm = await ask(`Você digitou "${locationName}". Está correto? (s/n): `);
    if (confirm.toLowerCase() === "s" || confirm.toLowerCase() === "sim") {
      break; // sai do loop se confirmado
    } else {
      locationName = ""; // zera para refazer de novo
    }
  } while (!locationName);

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

  console.log("\n⚡ Aplicação simplificada?");
  console.log("1. Sim");
  console.log("2. Não (tanto faz)");
  const optEasyApply = await ask("Selecione 1 ou 2: ");

  rl.close();

  const timeMap = { 1: "r86400", 2: "r604800", 3: "r2592000" };
  const f_TPR = timeMap[optPeriod] || "r86400";

  const workTypeMap = { 1: "2", 2: "3", 3: "1" };
  const f_WT = workTypeMap[optWorkType] || "";

  const f_AL = optEasyApply === "1" ? "true" : "";

  // -----------------------------------------------------------
  // 1️⃣ Busca o geoId
  // -----------------------------------------------------------
  console.log(`\n🌐 Buscando geoId de "${locationName}"...`);

  let geoId = null;
  try {
    const suggestUrl = "https://www.linkedin.com/jobs-guest/api/typeaheadHits";
    const suggestRes = await axios.get(suggestUrl, {
      params: { keywords: locationName, origin: "JOBS_HOME_ORGANIC" },
      headers: {
        "User-Agent": "Mozilla/5.0",
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
  // 2️⃣ Busca das vagas
  // -----------------------------------------------------------
  console.log(`\n📡 Buscando vagas de "${keywordInput}" em ${locationName}...\n`);

  const baseUrl = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
  let start = 0;
  const filteredJobs = [];
  const normalizedKeyword = normalizeText(keywordInput);

  try {
    while (true) {
      const params = {
        keywords: keywordInput,
        f_TPR,
        start,
        ...(f_WT ? { f_WT } : {}),
        ...(f_AL ? { f_AL } : {}),
        ...(geoId ? { geoId } : { location: locationName })
      };

      const res = await axios.get(baseUrl, {
        params,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      if (!res.data || res.data.trim() === "") break;

      const dom = new JSDOM(res.data);
      const document = dom.window.document;
      const cards = document.querySelectorAll(".base-card");

      if (!cards.length) break;

      for (const card of cards) {
        const title = card.querySelector(".base-search-card__title")?.textContent?.trim() || "";
        const company = card.querySelector(".base-search-card__subtitle")?.textContent?.trim() || "";
        const location = card.querySelector(".job-search-card__location")?.textContent?.trim() || "";
        const time = card.querySelector("time")?.getAttribute("datetime") || "";
        const url = card.querySelector("a.base-card__full-link")?.href?.split("?")[0] || "";

        let matchesKeyword = false;

        try {
          const jobPage = await axios.get(url, {
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Accept-Language": "pt-BR,pt;q=0.9",
            },
          });

          const jobDom = new JSDOM(jobPage.data);
          const jobDocument = jobDom.window.document;
          const description =
            jobDocument.querySelector(".show-more-less-html__markup")?.textContent || "";

          const normalizedTitle = normalizeText(title);
          const normalizedDescription = normalizeText(description);

          // ✅ Termo deve aparecer no título ou na descrição
          matchesKeyword =
            normalizedTitle.includes(normalizedKeyword) ||
            normalizedDescription.includes(normalizedKeyword);
        } catch {
          console.log("⚠️ Falha ao ler descrição da vaga:", title);
        }

        if (matchesKeyword) {
          filteredJobs.push({ title, company, location, time, url });
        }

        // evitar bloqueio 🚫429
        await new Promise((r) => setTimeout(r, 700));
      }

      console.log(`📄 Página ${start / 25 + 1} analisada...`);
      start += 25;
    }

    console.log(`\n🎯 Vagas realmente relacionadas encontradas: ${filteredJobs.length}`);
    console.log("------------------------------------------------------------");

    filteredJobs.forEach((j, i) => {
      console.log(`${i + 1}. ${j.title} — ${j.company}`);
      console.log(`   📍 ${j.location}`);
      console.log(`   🕒 ${j.time}`);
      console.log(`   🔗 ${j.url}`);
      console.log("");
    });

    fs.writeFileSync("vagas_filtradas.json", JSON.stringify(filteredJobs, null, 2));
    console.log("💾 Vagas salvas em vagas_filtradas.json");
  } catch (err) {
    console.error("❌ Erro ao buscar vagas:", err.message);
  }
})();

