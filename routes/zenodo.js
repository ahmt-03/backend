const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { isEmpty } = require('lodash');
const queryString = require('query-string');
const Data = require('../models/dataModel');

async function fetchData(page) {
    try {
        // Wait for the search results to load. We are looking for the container of the items.
        await page.waitForSelector('.items', { timeout: 12000 });

        // Extract the page content and use Cheerio to traverse it
        const html = await page.content();
		console.log("Page content retrieved, parsing...");
        const $ = cheerio.load(html);

        // Find each '.item' within the '.items' container, which represents each record
        const listings = $('.items .item').map((index, element) => {
            // Extract the title and href attributes
            const titleElement = $(element).find('h2.header a');
            const title = titleElement.text().trim();
            const relativeUrl = titleElement.attr('href');

            // Construct the absolute URL
            const absoluteUrl = relativeUrl.startsWith('http') 
                ? relativeUrl 
                : 'https://zenodo.org' + relativeUrl;

            // Extract the description
            const description = $(element).find('.description').text().trim();

            // Extract author names; these are within the '.creatibutor-name' class
            const authors = $(element)
                .find('.creatibutor-name')
                .map((i, author) => $(author).text().trim())
                .get();

            const uploaded = $(element).find('small p').first().text().trim(); // e.g., "Uploaded on April 12, 2023"
            const views = parseInt($(element).find('.eye.icon').closest('.label').text().trim()) || 0;
            const downloads = parseInt($(element).find('.download.icon').closest('.label').text().trim()) || 0;
			
			console.log("Processed item: " + title); // Log each item being processed

            // Return the constructed object
            return {
                title,
                authors,
                description,
				url: absoluteUrl,
            };
        }).get(); 

		console.log(`Extracted ${listings.length} listings`);

        return listings;
    } catch (error) {
        console.error('Error fetching data:', error.message);
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
			headless: false,
			defaultViewport: null,
			args: [
				"--incognito",
				"--no-sandbox",
				"--single-process",
				"--no-zygote"
			],
		};

		console.log("Launching browser...");

		const browser = await puppeteer.launch(chromeOptions);
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
		await page.setViewport({width:960,height:768});
		await page.goto(url);

		// wait for timeout
		await page.waitForTimeout(30000);

		console.log("Fetching data...");

		const data = await fetchData(page);
		const filters = await fetchFilters(page);
		const pagination = await fetchPagination(page);

		console.log("Closing browser...");

		await browser.close();

		console.log("Operation completed successfully.");

		return { data, filters, pagination };
	} catch (error) {
		console.log(error);
		return { data: [], filters: [], pagination: [] };
	}
}

router.post('/scraper', async (req, res) => {
	try {
		const { url } = req.body;

		console.log("Received scrape request for URL: " + url);
		const data = await main(url);
		const parameters = queryString.parseUrl(url);
		let keyword = parameters.query.q;
		delete parameters.query.q;

		console.log("Saving to database...");
		const dataDB = new Data({
			name: req.user.name,
			email: req.user.email,
			platform: 'zenodo',
			search: { url, keyword, filters: { ...parameters.query } },
			data: data.data
		});
		await dataDB.save();

		console.log("Data saved successfully.");
		res.send(data);
	} catch (error) {
		console.log(error);

		console.error('Error during scraping process:', error.message); // Detailed error message
		res.status(500).send({ data: [], filters: [], pagination: [] });
	}
});

module.exports = router;
