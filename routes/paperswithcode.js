const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const queryString = require('query-string');
const Data = require('../models/dataModel');

async function fetchData(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const listings = $('.dataset-wide-box')
		.map((index, element) => {
			const url = $(element).find('a').attr('href');
			const titleElement = $(element).find('.name');
			const descriptionElement = $(element).find('.description>p:first-of-type');
			const descriptionStatsElement = $(element).find('.description-stats');
			const imageElement = $(element).find('.card-background-image');
			const title = $(titleElement)
				.clone()
				.children() //select all the children
				.remove() //remove all the children
				.end()
				.text()
				.trim();
			const description = $(descriptionElement).text().replace(/\r?\n|\r/g, ' ').trim();
			const descriptionStats = $(descriptionStatsElement).text().split('\n');
			const imageUrl = $(imageElement).css('background-image')
				? $(imageElement).css('background-image').replace(/^url\(['"](.+)['"]\)/, '$1')
				: null;
			return {
				title,
				description,
				url: 'https://paperswithcode.com' + url,
				imageUrl,
				papers: descriptionStats[1].trim(),
				benchmarks: descriptionStats[3].trim().slice(1).trim()
			};
		})
		.get();
	return listings;
}

async function fetchFilters(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const listings = $('#id_datasets_filters')
		.map((index, element) => {
			const filterElements = $(element).find('.datasets-filter');
			const filterDetail = $(filterElements)
				.map((index, element) => {
					const filterNameElement = $(element).find('.filter-name');
					const filterItemsElement = $(element).find('.filter-items');
					const filterName = $(filterNameElement).text().trim();
					const filterItemElements = $(filterItemsElement).find('.filter-item');
					const filterItems = $(filterItemElements)
						.map((index, element) => {
							const filterItemName = $(element)
								.clone()
								.children() //select all the children
								.remove() //remove all the children
								.end() //again go back to selected element
								.text()
								.replace(/\r?\n|\r/g, ' ')
								.trim();
							const filterItemUrl = $(element).attr('href');
							const filterItemNumber = $(element).find('.badge').text().trim();
							return {
								filterItemName,
								filterItemUrl: 'https://paperswithcode.com/datasets' + filterItemUrl,
								filterItemNumber
							};
						})
						.get();
					return {
						filterName,
						filterItems
					};
				})
				.get();
			return filterDetail;
		})
		.get();
	return listings;
}

async function fetchPagination(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const pageItemElements = $('.page-item');
	const pageItems = $(pageItemElements)
		.map((index, element) => {
			const pageName = $(element).text().replace(/\r?\n|\r/g, ' ').trim();
			const pageUrl = $(element).find('a').attr('href');
			return {
				pageName,
				pageUrl: 'https://paperswithcode.com/datasets' + pageUrl,
				isDisabled: $(element).hasClass('disabled')
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
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
		await page.setViewport({width:960,height:768});
		await page.goto(url);
		const data = await fetchData(page);
		const filters = await fetchFilters(page);
		const pagination = await fetchPagination(page);
		await browser.close();
		return { data, filters, pagination };
	} catch (error) {
		console.log(error);
		return { data: [], filters: [], pagination: [] };
	}
}

router.post('/scraper', async (req, res) => {
	try {
		const { url } = req.body;
		const data = await main(url);
		const parameters = queryString.parseUrl(url);
		let sort = parameters.query.o;
		let keyword = parameters.query.q;
		delete parameters.query.o;
		delete parameters.query.v;
		delete parameters.query.q;

		const dataDB = new Data({
			name: req.user.name,
			email: req.user.email,
			platform: 'paperswithcode',
			search: { url, keyword, filters: { sort, ...parameters.query } },
			data: data.data
		});
		await dataDB.save();
		res.send(data);
	} catch (error) {
		console.log(error);
		res.send({ data: [], filters: [], pagination: [] });
	}
});

module.exports = router;
