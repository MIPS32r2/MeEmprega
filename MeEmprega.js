import readline from "readline";
import axios from "axios";
import fs from "fs";
import { JSDOM } from "jsdom";


const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeText = (text) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const interpretarLocalidade = (input) => {
  const cleaned = input.trim().toLowerCase();
  const normalized = normalizeText(cleaned);

  if (normalized === "brazil" || normalized === "brasil") {
    return { tipo: "pais", termo: "Brazil" };
  }

  if (cleaned.includes(",")) {
    const partes = cleaned.split(",").map(p => p.trim());
    if (partes.length === 2) {
      const cidade = partes[0];
      const pais = normalizeText(partes[1]);

      if (pais === "brazil" || pais === "brasil") {
        return { tipo: "estado", termo: cidade };
      }
    }
  }

  return { tipo: "cidade", termo: cleaned };
};


(async () => {
  console.log("🔍 Busca de vagas no LinkedIn");
  console.log("----------------------------------");

  const keywordInput = await ask("📌 Termo da vaga (ex: linux, devops): ");

  let locationName = "";
  let geoId = null;
  let tipoLocalidade = "";

  do {
    const inputLoc = await ask("🌎 Localidade (ex: Goiânia, Brazil): ");
    const { tipo, termo } = interpretarLocalidade(inputLoc);
    tipoLocalidade = tipo;

    try {
      const suggestRes = await axios.get(
        "https://www.linkedin.com/jobs-guest/api/typeaheadHits",
        {
          params: {
            origin: "jserp",
            typeaheadType: "GEO",
            geoTypes:
              tipo === "pais"
                ? "COUNTRY"
                : tipo === "estado"
                  ? "STATE"
                  : "POPULATED_PLACE",
            query: termo,
          },
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
        }
      );

      const hits = suggestRes.data || [];
      if (hits.length) {
        geoId = hits[0].id;
        locationName = hits[0].displayName.split(",")[0];
        console.log(`✅ Localidade reconhecida (${tipoLocalidade}): ${hits[0].displayName}`);
        break;
      } else {
        console.log("⚠️ Localidade não encontrada.");
      }
    } catch (e) {
      console.warn("⚠️ Erro:", e.message);
    }
  } while (!locationName);

  console.log("\n1. Últimas 24h\n2. Última semana\n3. Último mês");
  const optPeriod = await ask("⏱️ Período: ");

  console.log("\n🏠 Tipo de trabalho:\n1. Remoto\n2. Híbrido\n3. Presencial\n4. Qualquer");
  const optWorkType = await ask("Selecione: ");

  console.log("\n⚡ Aplicação simplificada?\n1. Sim\n2. Tanto faz");
  const optEasyApply = await ask("Selecione: ");

  console.log("\n👥 Apenas vagas com menos de 10 candidatos?\n1. Sim\n2. Não");
  const optFewApplicants = await ask("Selecione: ");

  rl.close();

  const timeMap = { 1: "r86400", 2: "r604800", 3: "r2592000" };
  const workTypeMap = { 1: "2", 2: "3", 3: "1" };

  const f_TPR = timeMap[optPeriod] || "r86400";
  const f_WT = workTypeMap[optWorkType] || "";
  const f_AL = optEasyApply === "1" ? "true" : "";
  const f_JIYN = optFewApplicants === "1" ? "true" : "";

  console.log(`\n📡 Buscando "${keywordInput}" em ${locationName}...\n`);


  const baseUrl =
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

  let start = 0;
  const filteredJobs = [];
  const normalizedKeyword = normalizeText(keywordInput);

  let emptyPages = 0;
  const MAX_EMPTY_PAGES = 2;

  let shadowBanScore = 0;
  const SHADOW_BAN_LIMIT = 3;

  try {
    while (true) {
      const params = {
        keywords: keywordInput,
        f_TPR,
        start,
        ...(f_WT && { f_WT }),
        ...(f_AL && { f_AL }),
        ...(f_JIYN && { f_JIYN }),
        ...(geoId ? { geoId } : { location: locationName }),
      };

      const res = await axios.get(baseUrl, {
        params,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      if (!res.data || res.data.length < 500) {
        shadowBanScore++;
        console.log("🚨 HTML suspeito (vazio/curto)");

        if (shadowBanScore >= SHADOW_BAN_LIMIT) {
          console.log("🛑 Shadow-ban provável. Encerrando.");
          break;
        }

        await sleep(5000);
        continue;
      }

      if (
        res.request?.res?.responseUrl?.includes("authwall") ||
        res.request?.res?.responseUrl?.includes("login")
      ) {
        console.log("🛑 Redirecionamento para login/authwall.");
        break;
      }

      const dom = new JSDOM(res.data);
      const cards = dom.window.document.querySelectorAll(".base-card");

      if (!cards.length) {
        shadowBanScore++;
        console.log("🚨 Nenhuma vaga retornada");

        if (shadowBanScore >= SHADOW_BAN_LIMIT) {
          console.log("🛑 Shadow-ban confirmado.");
          break;
        }

        await sleep(5000);
        start += 25;
        continue;
      }

      let pageHasValidJobs = false;

      for (const card of cards) {
        const title = card.querySelector(".base-search-card__title")?.textContent?.trim() || "";
        const company = card.querySelector(".base-search-card__subtitle")?.textContent?.trim() || "";
        const location = card.querySelector(".job-search-card__location")?.textContent?.trim() || "";
        const time = card.querySelector("time")?.getAttribute("datetime") || "";
        const url = card.querySelector("a.base-card__full-link")?.href?.split("?")[0] || "";

        try {
          const jobPage = await axios.get(url, {
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Accept-Language": "pt-BR,pt;q=0.9",
            },
          });

          const doc = new JSDOM(jobPage.data).window.document;
          const description =
            doc.querySelector(".show-more-less-html__markup")?.textContent || "";

          if (
            normalizeText(title).includes(normalizedKeyword) ||
            normalizeText(description).includes(normalizedKeyword)
          ) {
            filteredJobs.push({ title, company, location, time, url });
            pageHasValidJobs = true;
          }
        } catch {
          console.log("⚠️ Erro ao acessar vaga:", title);
        }

        await sleep(800);
      }

      if (!pageHasValidJobs) {
        emptyPages++;
        console.log("⚠️ Página sem vagas relevantes");

        if (emptyPages >= MAX_EMPTY_PAGES) {
          console.log("🛑 Encerrando busca (sem novos resultados)");
          break;
        }
      } else {
        emptyPages = 0;
      }

      shadowBanScore = 0;
      console.log(`📄 Página ${(start / 25) + 1} analisada`);
      start += 25;
    }

    console.log(`\n🎯 Vagas encontradas: ${filteredJobs.length}`);
    console.log("----------------------------------");

    filteredJobs.forEach((j, i) => {
      console.log(`${i + 1}. ${j.title} — ${j.company}`);
      console.log(`   📍 ${j.location}`);
      console.log(`   🕒 ${j.time}`);
      console.log(`   🔗 ${j.url}\n`);
    });

    fs.writeFileSync(
      "vagas_filtradas.json",
      JSON.stringify(filteredJobs, null, 2)
    );

    console.log("💾 Arquivo salvo: vagas_filtradas.json");

  } catch (err) {
    console.error("❌ Erro geral:", err.message);
  }
})();
