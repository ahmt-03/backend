const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { isEmpty } = require('lodash');
const queryString = require('query-string');
const Data = require('../models/dataModel');

async function fetchData(page) {
    try {
        await page.waitForSelector('.items', { timeout: 3000 });
        const html = await page.content();
		console.log(html);  
        const $ = cheerio.load(html);
        const listings = $('.items .item').map((index, element) => {

			console.log("Mapping items");
            const titleElement = $(element).find('h2.header a');
            const title = titleElement.text().trim();
            const relativeUrl = titleElement.attr('href');

            const absoluteUrl = (relativeUrl&&relativeUrl.startsWith('http')) 
                ? relativeUrl 
                : 'https://zenodo.org' + relativeUrl;

            const description = $(element).find('.description').text().trim();

            const authors = $(element)
                .find('.creatibutor-name')
                .map((i, author) => $(author).text().trim())
                .get();

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
    let filterCategories = [];

    // Update the selector to target child divs under the main div with the specific aria-label
    $('[aria-label="Search filters"] > .facet-container').each((index, container) => {
        const filterCategory = $(container).find('h2.header').text().trim();
        let filters = [];

        $(container).find('[role="listitem"]').each((idx, elem) => {
            const filterName = $(elem).find('label').text().trim();
            const filterCountText = $(elem).find('.facet-count span').text().trim();
            const filterCount = parseInt(filterCountText.replace(/[^\d]/g, ''), 10) || 0;

            const isChecked = $(elem).find('input[type="checkbox"]').attr('checked') ? true : false;

            const filter = {
                filterName,
                filterCount,
                isChecked
            };
            filters.push(filter);
        });

        if (filters.length > 0) {
            filterCategories.push({
                category: filterCategory,
                filters: filters,
            });
        }
    });

    return filterCategories;
}



async function fetchPagination(page) {
    const html = await page.content();
    const $ = cheerio.load(html);

    const pageItemElements = $('.pagination').find('a[type="pageItem"]').toArray();

    const pageItems = pageItemElements.map(element => {
        const pageName = $(element).text().replace(/\r?\n|\r/g, ' ').trim();
        const isDisabled = $(element).attr('aria-disabled') === "true";

        const isActive = $(element).hasClass('active');

        return {
            pageName,
            isDisabled,
            isActive // Added this to determine which page is currently active
        };
    });

    return pageItems;
}


async function main(url) {
    try {
        const chromeOptions = {
            headless: 'new', // The browser will be visible
            defaultViewport: null,
            args: [
                '--disable-web-security', 
                '--disable-features=IsolateOrigins,site-per-process', 
                '--incognito', 
                '--no-sandbox', 
                //'--single-process',
                '--no-zygote' 
            ],
        };

        console.log("Launching browser...");

        const browser = await puppeteer.launch(chromeOptions);
        const page= await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
        await page.setViewport({width:960,height:768});

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            console.log(`>> ${request.method()} ${request.url()}`); 
            request.continue();
        });
        page.on('response', (response) => {
            console.log(`<< ${response.status()} ${response.url()}`); 
        });

        await page.goto(url, { waitUntil: 'networkidle0' ,timeout:0});
        await page.waitForSelector(".ui.grid", { visible: true });


        console.log("Fetching data...");

        const data = await fetchData(page);
        const filters = await fetchFilters(page);
        console.log("Fetched Filters Data:", filters);
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
