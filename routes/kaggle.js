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
  const listings = $(".deQTnI")
    .map((index, element) => {
      const titleElement = $(element).find(".izULIq");
      const urlElement = $(element).find("a");
      const imageElement = $(element).find(".juOVue");
      const image2Element = $(imageElement).find("div");
      const authorElement = $(element).find(".ittBhE");
      const datasetDescriptionElements = $(element).find("span").toArray();
      const datasetDescription = datasetDescriptionElements.flatMap(
        (element) => {
          return [$(element).text()];
        }
      );
      const title = $(titleElement).text();
      const author = $(authorElement).text();
      const authorUrl =
        "https://www.kaggle.com" + $(authorElement).attr("href");
      const url = "https://www.kaggle.com" + $(urlElement).attr("href");
      const imageUrl = $(image2Element).css("background-image")
        ? $(image2Element)
            .css("background-image")
            .replace(/^url\(['"](.+)['"]\)/, "$1")
        : null;
      return {
        title,
        url,
        author,
        authorUrl,
        imageUrl,
        datasetDescription,
      };
    })
    .get();
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
    await page.goto(url);
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
