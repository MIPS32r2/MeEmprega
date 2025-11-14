import readline from "readline";
import axios from "axios";
import fs from "fs";
import { JSDOM } from "jsdom";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const normalizeText = (text) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const interpretarLocalidade = (input) => {
  const cleaned = input.trim().toLowerCase();
  const isState = cleaned.includes("brazil");

  let name = cleaned.replace(", brazil", "").trim();

  if (isState) {
    return { tipo: "estado", termo: name };
  }
  return { tipo: "cidade", termo: name };
};

(async () => {
  console.log("🔍 Busca de vagas no LinkedIn");
  console.log("----------------------------------");

  const keywordInput = await ask("📌 Digite o termo da vaga (ex: linux, devops): ");

  let locationName = "";
  let geoId = null;

  do {
    const inputLoc = await ask("🌎 Digite a localidade (ex: São Paulo ou São Paulo, Brazil): ");
    const { tipo, termo } = interpretarLocalidade(inputLoc);

    try {
      const suggestRes = await axios.get(
        "https://www.linkedin.com/jobs-guest/api/typeaheadHits",
        {
          params: {
            origin: "jserp",
            typeaheadType: "GEO",
            geoTypes: tipo === "estado" ? "STATE" : "POPULATED_PLACE",
            query: termo,
          },
          headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9" },
        }
      );

      const hits = suggestRes.data || [];
      const match = hits.find(
        (el) => normalizeText(el.displayName.split(",")[0]) === normalizeText(termo)
      );

      if (match) {
        geoId = match.id;
        locationName = match.displayName.split(",")[0];
        console.log(`✅ Localidade reconhecida (${tipo === "estado" ? "Estado" : "Cidade"}): ${locationName}`);
        break;
      } else {
        console.log("⚠️ Localidade não encontrada. Tente novamente.");
      }
    } catch (err) {
      console.warn("⚠️ Erro ao consultar:", err.message);
    }
  } while (!locationName);

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
        ...(geoId ? { geoId } : { location: locationName }),
      };

      const res = await axios.get(baseUrl, {
        params,
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9" },
      });

      if (!res.data || res.data.trim() === "") break;

      const dom = new JSDOM(res.data);
      const cards = dom.window.document.querySelectorAll(".base-card");
      if (!cards.length) break;

      for (const card of cards) {
        const title = card.querySelector(".base-search-card__title")?.textContent?.trim() || "";
        const company = card.querySelector(".base-search-card__subtitle")?.textContent?.trim() || "";
        const location = card.querySelector(".job-search-card__location")?.textContent?.trim() || "";
        const time = card.querySelector("time")?.getAttribute("datetime") || "";
        const url = card.querySelector("a.base-card__full-link")?.href?.split("?")[0] || "";

        try {
          const jobPage = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9" },
          });

          const jobDocument = new JSDOM(jobPage.data).window.document;
          const description =
            jobDocument.querySelector(".show-more-less-html__markup")?.textContent || "";

          const normalizedTitle = normalizeText(title);
          const normalizedDescription = normalizeText(description);

          if (
            normalizedTitle.includes(normalizedKeyword) ||
            normalizedDescription.includes(normalizedKeyword)
          ) {
            filteredJobs.push({ title, company, location, time, url });
          }

        } catch {
          console.log("⚠️ Descrição indisponível:", title);
        }

        await new Promise((r) => setTimeout(r, 800));
      }

      console.log(`📄 Página ${start / 25 + 1} analisada...`);
      start += 25;
    }

    console.log(`\n🎯 Vagas encontradas: ${filteredJobs.length}`);
    console.log("------------------------------------------------");

    filteredJobs.forEach((j, i) => {
      console.log(`${i + 1}. ${j.title} — ${j.company}`);
      console.log(`   📍 ${j.location}`);
      console.log(`   🕒 ${j.time}`);
      console.log(`   🔗 ${j.url}\n`);
    });

    fs.writeFileSync("vagas_filtradas.json", JSON.stringify(filteredJobs, null, 2));
    console.log("💾 Vagas salvas em vagas_filtradas.json");

  } catch (err) {
    console.error("❌ Erro ao buscar vagas:", err.message);
  }
})();

