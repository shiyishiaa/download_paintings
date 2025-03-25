import puppeteer from "puppeteer";

(async () => {
    // Launch the browser
    const browser = await puppeteer.launch({
        // headless: false,
        slowMo: 250,
        // devtools: true
    });

    // Create a page
    const page = await browser.newPage();

    /* Enquire max page */
    const baseUrl = "https://www.metmuseum.org/art/collection/search?department=1&showOnly=highlights%7CwithImage&material=Paintings";
    await page.goto(baseUrl);
    const paginationText = await page.$$eval("button[class^=\"pagination-controls_paginationButton\"]", buttons => buttons.map(button => button.innerText));
    const maxPage = Number(paginationText[paginationText.length - 2]);

    /* Construct page urls */
    const urls = []
    for (let i = 0; i < maxPage; i++) {
        urls.push(`${baseUrl}&offset=${i * 40}`)
    }

    /* Acquire image thumbnail addresses */
    let imageLinks = [];
    for (let url of urls) {
        await page.goto(url)
        const images = await page.$$eval('figure[class^="collection-object"] img[class^="collection-object_image"]', imgs => imgs.map(img => img.src));
        imageLinks = imageLinks.concat(images)
    }

    /* Substitute thumbnail addresses to download links */
    let pattern = /CRDImages\/(.*?)\/mobile-large/;
    const abbr = imageLinks[0].match(pattern)[1];
    const prefix = `https://images.metmuseum.org/CRDImages/${abbr}/original/`;
    imageLinks.forEach(link => {
        const fileName = link.replace(`https://images.metmuseum.org/CRDImages/${abbr}/mobile-large/`, "");
        console.log(prefix + fileName);
    })

    await browser.close();
})();