const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const queryString = require('query-string');
const Data = require('../models/dataModel');
const licenseMapping = require('../utils/licenseMapping');

async function fetchData(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const listings = $('.search-result')
		.map((index, element) => {
			const titleElement = $(element).find('h4');
			const datasetDescriptionElement = $(element).find('.metatext');
			const datasetDescription = $(datasetDescriptionElement).text();
			const datasetDetailDescriptionElement = $(element).find('.dataset-description');
			const datasetDetailDescription = $(datasetDetailDescriptionElement).text().replace(/\r?\n|\r/g, ' ');
			const fileTypesElement = $(element).find('.label');
			const fileTypes = $(fileTypesElement).text();
			const licenseElements = $(element).find('.dataset-file-license').toArray();
			const lastModifiedDateElement = $(element).find('.dataset-last-mod-date');
			const lastModifiedDate = $(lastModifiedDateElement).text();
			const license = licenseElements.flatMap((element) => {
				return [ $(element).text() ];
			});
			const title = $(titleElement).text();
			return {
				title,
				datasetDescription,
				datasetDetailDescription,
				fileTypes,
				license,
				lastModifiedDate,
				index
			};
		})
		.get();
	return listings;
}

async function fetchPagination(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const pageItemElement = $('.pager');
	const pageItemElements = $(pageItemElement).find('li').toArray();
	const pageItems = $(pageItemElements)
		.map((index, element) => {
			const pageName = $(element).text().replace(/\r?\n|\r/g, ' ').trim();
			return {
				pageName
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
			args: [
				"--incognito",
				"--no-sandbox",
				"--single-process",
				"--no-zygote"
			],
		};
		const browser = await puppeteer.launch(chromeOptions);
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
		await page.setViewport({width:960,height:768});
		const page = await browser.newPage();
		await page.goto(url);
		await page.waitForSelector('.search-result');
		const data = await fetchData(page);
		const pagination = await fetchPagination(page);
		await browser.close();
		return { data, pagination };
	} catch (error) {
		console.log(error);
		return { data: [], pagination: [] };
	}
}

async function getDatasetUrl(url, index) {
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
	await page.setViewport({width:960,height:768});
	await page.goto(url);
	await page.waitForSelector('.dataset-name');
	const html = await page.content();
	const $ = cheerio.load(html);
	const seeMoreButton = await page.$x(`//a[contains(., 'SEE MORE')]`);
	await seeMoreButton[index].click();
	await page.waitForTimeout(500);
	const durl = page.url();
	return durl;
}

router.post('/scraper', async (req, res) => {
	const { url } = req.body;
	const data = await main(url);
	const parameters = queryString.parseUrl(url);
	let keyword = parameters.query.term;
	delete parameters.query.term;
	let license = licenseMapping[parameters.query.license];
	delete parameters.query.license;
	try {
		const dataDB = new Data({
			name: req.user.name,
			email: req.user.email,
			platform: 'microsoftresearch',
			search: { url, keyword, filters: { license, ...parameters.query } },
			data: data.data
		});
		await dataDB.save();
	} catch (error) {
		console.log(error);
	}
	res.send(data);
});

router.post('/datasetUrl', async (req, res) => {
	const { url, index } = req.body;
	const datasetUrl = await getDatasetUrl(url, index);
	res.send({ url: datasetUrl });
});

module.exports = router;
