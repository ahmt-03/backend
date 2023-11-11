const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const { isEmpty } = require("lodash");
const queryString = require("query-string");
const Data = require("../models/dataModel");

async function fetchData(page) {
  const html = await page.content();
  const $ = cheerio.load(html);

  const listings = $("li[role='listitem']").map((index, element) => {
      const titleElement = $(element).find(".sc-beqWaB.sc-fGFwAa.sc-eYhfvQ.ibASuG");
      const urlElement = $(element).find("a.sc-gAfzvj.hbMcwx");
      const imageElement = $(element).find(".sc-kwdcip.kEANfW");
      const authorElement = $(element).find("a.sc-jegxcv.sc-cbelXg.kUdbaN.kYfCVP");

      const title = $(titleElement).text().trim();
      const url = "https://www.kaggle.com" + $(urlElement).attr("href");

      const style = $(imageElement).attr("style");
      const match = style && style.match(/url\(["']?(.*?)["']?\)/i);
      const imageUrl = match ? match[1] : null;

      const author = $(authorElement).text().trim();
      const authorUrl = "https://www.kaggle.com" + $(authorElement).attr("href");

      const datasetDescriptionElements = $(element).find("span.sc-lnAgIa.sc-iKGpAt.sc-iqavZe.bqETvQ.kKrujI.igKnYa").toArray();
      const datasetDescription = datasetDescriptionElements.map(el => $(el).text());

      return {
          title,
          url,
          author,
          authorUrl,
          imageUrl,
          datasetDescription,
      };
  }).get();

  return listings;
}


async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}
async function fetchPagination(page) {
  const html = await page.content();
  const $ = cheerio.load(html);
  const pageItemElement = $('[role="navigation"]');
  const pageItemElements = $(pageItemElement).find('[role="button"]').toArray();
  const pageItems = $(pageItemElements)
    .map((index, element) => {
      const pageName = $(element)
        .text()
        .replace(/\r?\n|\r/g, " ")
        .trim();
      return {
        pageName,
      };
    })
    .get();
  return pageItems;
}

async function main(url) {
  try {
    const chromeOptions = {
      headless: true,
      defaultViewport: null,
      args: ["--incognito", "--no-sandbox", "--single-process", "--no-zygote"],
    };
    const browser = await puppeteer.launch(chromeOptions);
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 926 });
    await page.goto(url, { waitUntil: 'networkidle0' });

    await autoScroll(page);
    let div_selector_to_remove = ".__react_component_tooltip";
    await page.evaluate((sel) => {
      var elements = document.querySelectorAll(sel);
      for (var i = 0; i < elements.length; i++) {
        elements[i].parentNode.removeChild(elements[i]);
      }
    }, div_selector_to_remove);

    const data = await fetchData(page);
    const pagination = await fetchPagination(page);

    await browser.close();

    return { data, pagination };
  } catch (error) {
    console.log(error);
    return { data: [], pagination: [] };
  }
}

router.post("/scraper", async (req, res) => {
  try {
    const { url } = req.body;
    const data = await main(url);
    const parameters = queryString.parseUrl(url);
    let keyword = parameters.query.search;
    delete parameters.query.search;

    const dataDB = new Data({
      name: req.user.name,
      email: req.user.email,
      platform: "kaggle",
      search: { url, keyword, filters: { ...parameters.query } },
      data: data.data,
    });

    await dataDB.save();
    res.send(data);
  } catch (error) {
    console.log(error);
    res.send({ data: [], pagination: [] });
  }
});

module.exports = router;
