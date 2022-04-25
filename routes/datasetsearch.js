const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Data = require('../models/dataModel');
const queryString = require('query-string');

async function fetchData(page, finalUrl) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const listings = $('.UnWQ5')
		.map((index, element) => {
			const divElement = $(element).find('div');
			const titleElement = $(divElement).find('.iKH1Bc');
			const datasetUrlElements = $(divElement).find('.iW1HZe').toArray();
			const datasetUrl = datasetUrlElements.flatMap((element) => {
				return [ $(element).text() ];
			});
			const title = $(titleElement).text();
			const imageUrl = $(divElement).find('img').attr('src') || '';
			const docid = $(divElement).attr('data-docid');
			const datasetTypeElement = $(divElement).find('.Sdfhre');
			const datasetType = $(datasetTypeElement).text().trim();
			const updatedDateElement = $(divElement).find('.zKF3u');
			const updatedDate = $(updatedDateElement).text().trim();
			return {
				title,
				datasetUrl,
				datasetType,
				updatedDate,
				docid,
				finalUrl,
				imageUrl,
				number: index + 1
			};
		})
		.get();
	return listings;
}

async function scrapeInfiniteScrollItems(page, fetchData, targetItemCount, finalUrl) {
	let data = [];
	try {
		while (data.length < targetItemCount) {
			data = await fetchData(page, finalUrl);
			await page.evaluate(`document.querySelector('.UnWQ5:nth-child(${data.length})').scrollIntoView()`);
			await page.waitForTimeout(500);
		}
	} catch (e) {
		console.log(e);
	}

	return data;
}

async function applyFilter(name, key, page, filters) {
	try {
		const [ button ] = await page.$x(`//span[contains(., '${name}')]`);
		await button.click();
		const [ button2 ] = await page.$x(`//span[contains(., '${filters[key]}')]`);
		await button2.click();
	} catch (e) {
		console.log(e);
	}

	await page.waitForTimeout(500);
	const url = await page.url();
	return url;
}

async function applyFreeFilter(page) {
	try {
		const [ button ] = await page.$x(`//span[contains(., 'Free')]`);
		await button.click();
	} catch (e) {
		console.log(e);
	}

	await page.waitForTimeout(500);
	const url = await page.url();
	return url;
}

async function main(url, pageNum, filters) {
	try {
		const chromeOptions = {
			headless: true,
			defaultViewport: null,
			args: [
				"--incognito",
				"--no-sandbox",
				"--single-process",
				"--no-zygote"
			],
		};
		const browser = await puppeteer.launch(chromeOptions);
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
		await page.setViewport({ width: 1280, height: 926 });
		await page.goto(url);
		await page.waitForTimeout(300);
		const urlAfterDate = await applyFilter('Last updated', 'lastUpdated', page, filters);
		await page.goto(urlAfterDate);
		await page.waitForTimeout(300);
		const urlAfterDownloadFormat = await applyFilter('Download format', 'downloadFormat', page, filters);
		await page.goto(urlAfterDownloadFormat);
		await page.waitForTimeout(300);
		const urlAfterUsageFilter = await applyFilter('Usage rights', 'usageRights', page, filters);
		await page.goto(urlAfterUsageFilter);
		await page.waitForTimeout(300);
		const urlAfterTopicFilter = await applyFilter('Topic', 'topic', page, filters);
		await page.goto(urlAfterTopicFilter);
		await page.waitForTimeout(300);
		if (filters.free) {
			const urlAfterFreeFilter = await applyFreeFilter(page);
			await page.goto(urlAfterFreeFilter);
			await page.waitForTimeout(300);
		}
		const finalUrl = await page.url();
		const targetItemCount = pageNum * 20;
		const data = await scrapeInfiniteScrollItems(page, fetchData, targetItemCount, finalUrl);
		await browser.close();
		const leastCount = (pageNum - 1) * 20;
		const mostCount = pageNum * 20;
		const filteredData = data.filter((item, index) => {
			return index >= leastCount && index < mostCount;
		});
		return filteredData;
	} catch (e) {
		console.log(e);
		return [];
	}
}

router.post('/scraper', async (req, res) => {
	const { url, pageNum, filters } = req.body;
	try {
		const data = await main(url, pageNum, filters);
		const parameters = queryString.parseUrl(url);
		const dataDB = new Data({
			name: req.user.name,
			email: req.user.email,
			platform: 'datasetsearch',
			search: { url, keyowrd: parameters.query.query, pageNum, filters },
			data: data
		});
		await dataDB.save();
		res.send({ data, pageNum, filters });
	} catch (error) {
		console.log(error);
		res.send({ data: [], pageNum, filters });
	}
});

module.exports = router;
