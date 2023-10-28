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
		console.log(html);  // This will print the whole HTML content of the page.
        const $ = cheerio.load(html);

        // Find each '.item' within the '.items' container, which represents each record
        const listings = $('.items .item').map((index, element) => {

			console.log("Mapping items");

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

    // This will hold the final results.
    let filterCategories = [];

    // The containers for the filters seem to be represented by the "facet-container" class in the provided HTML.
    // We'll iterate over each of these containers.
    $('.facet-container').each((index, container) => {

        // The category of the filter can be found in the 'h2' element (based on your HTML structure).
        const filterCategory = $(container).find('h2.header').text().trim();

        // This will hold individual filters for the current category.
        let filters = [];

        // Now, we need to extract the filters themselves, which are in elements with role="listitem".
        $(container).find('[role="listitem"]').each((idx, elem) => {
            // The filter's name seems to be in a 'label' tag.
            const filterName = $(elem).find('label').text().trim();

            // The count is in an element with the 'facet-count' class, based on the provided HTML.
            const filterCountText = $(elem).find('.facet-count').text().trim();
            // Clean up and parse the filter count text.
            const filterCount = parseInt(filterCountText.replace(/[^\d]/g, ''), 10) || 0;

            // Determine whether the filter is active by the presence of the 'checked' attribute.
            const isChecked = $(elem).find('input[type="checkbox"]').attr('checked') ? true : false;

            // Create a filter object.
            const filter = {
                filterName,
                filterCount, // Optional: depends on whether you want to include this information.
                isChecked
            };

            // Add the filter to the current category's filters.
            filters.push(filter);
        });

        // If we have any filters, we add them under the current category.
        if (filters.length > 0) {
            filterCategories.push({
                category: filterCategory,
                filters: filters,
            });
        }
    });

    // The result is a list of categories, each with its own list of filters.
    return filterCategories;
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

		await page.setRequestInterception(true);
page.on('request', (request) => {
    console.log(`>> ${request.method()} ${request.url()}`); // This will log all network requests initiated by the page
    request.continue();
});
page.on('response', (response) => {
    console.log(`<< ${response.status()} ${response.url()}`); // This logs all responses
});

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
