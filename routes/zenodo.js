const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { isEmpty } = require('lodash');
const queryString = require('query-string');
const Data = require('../models/dataModel');

async function fetchData(page) {
	try {
		// wait for selector .record-elem
		await page.waitForSelector('.record-elem', { timeout: 10000 });
		const html = await page.content();
		const $ = cheerio.load(html);
		const listings = $('.record-elem')
			.map((index, element) => {
				const h4Element = $(element).find('h4');
				const titleElement = $(h4Element).find('a');
				const title = $(titleElement).text();
				const url = $(titleElement).attr('ng-href');
				const descriptionElements = $(element).find('p').toArray();
				const authorElement = descriptionElements[0];
				const authorsArray = $(authorElement).find('span').toArray();
				const authors = authorsArray.flatMap((author) => {
					return isEmpty($(author).text().replace(/\r?\n|\r/g, ' ').trim())
						? []
						: [ $(author).text().replace(/\r?\n|\r/g, ' ').trim() ];
				});

				const description = descriptionElements.slice(1).flatMap((descriptionElement) => {
					return isEmpty($(descriptionElement).text().replace(/\r?\n|\r/g, ' ').trim())
						? []
						: [ $(descriptionElement).text().replace(/\r?\n|\r/g, ' ').trim() ];
				});
				return {
					title,
					authors,
					description,
					url: 'https://zenodo.org' + url
				};
			})
			.get();
		return listings;
	} catch (error) {
		console.log(error);
		return [];
	}
}

async function fetchFilters(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const listings = $('.panel-default')
		.map((index, element) => {
			const filterHeadingElement = $(element).find('.panel-heading');
			const filterHeading = $(filterHeadingElement).text().trim();
			const filterBodyElement = $(element).find('.panel-body');
			const filterElements = $(filterBodyElement).find('ul>li').toArray();
			const filterListings = filterElements.flatMap((filterElement) => {
				// find parent of filterElement
				const parentElement = $(filterElement).parent();
				// find value of ng-repeat attr of parent
				const ngRepeat = $(parentElement).attr('ng-repeat');
				// if ngRepeat contains subValue return []
				if (ngRepeat.includes('subValue')) {
					return [];
				}
				const inputElement = $(filterElement).find('input');
				// check if checked attribute is present
				const isChecked = $(inputElement).attr('checked') ? true : false;
				const filterText = $(filterElement)
					.clone()
					.children() //select all the children
					.remove() //remove all the children
					.end() //again go back to selected element
					.text()
					.replace(/\r?\n|\r/g, ' ')
					.trim();
				const filterTextName = filterText.split(' ')[0];
				const filterTextNumber = filterText.split(' ')[1];
				return isEmpty(filterText) ? [] : [ { filterTextName, filterTextNumber, isChecked } ];
			});
			return {
				filterHeading,
				filterListings
			};
		})
		.get();
	return listings;
}

async function fetchPagination(page) {
	const html = await page.content();
	const $ = cheerio.load(html);
	const pageItemElement = $('.pagination');
	const pageItemElements = $(pageItemElement).find('li').toArray();
	const pageItems = $(pageItemElements)
		.map((index, element) => {
			const pageName = $(element).text().replace(/\r?\n|\r/g, ' ').trim();
			return {
				pageName,
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
		// wait for timeout 5 sec
		await page.waitForTimeout(5000);
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
		let keyword = parameters.query.q;
		delete parameters.query.q;

		const dataDB = new Data({
			name: req.user.name,
			email: req.user.email,
			platform: 'zenodo',
			search: { url, keyword, filters: { ...parameters.query } },
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
