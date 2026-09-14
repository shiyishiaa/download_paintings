import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath, pathToFileURL} from "node:url";
import process from "node:process";
import {constants, createWriteStream} from "node:fs";
import {access, copyFile, mkdir, rm} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {pipeline} from "node:stream/promises";

const API = "https://collectionapi.metmuseum.org/public/collection";
const DOWNLOAD_DIR = fileURLToPath(new URL("./downloads/", import.meta.url));

export async function downloadImage(url, directory = DOWNLOAD_DIR) {
    const filename = decodeURIComponent(new URL(url).pathname.split("/").pop());
    if (!filename || filename === "." || filename === ".." || /[<>:"/\\|?*\x00-\x1f]/.test(filename)) {
        throw new Error(`Invalid image filename: ${filename}`);
    }
    await mkdir(directory, {recursive: true});
    const destination = join(directory, filename);
    try {
        await access(destination);
        console.log(`Skipped: ${filename}`);
        return;
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }

    const temporary = join(directory, `.${randomUUID()}.part`);
    try {
        const response = await fetch(url, {signal: AbortSignal.timeout(120_000)});
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        if (!response.headers.get("content-type")?.startsWith("image/")) {
            await response.body?.cancel();
            throw new Error(`Expected an image: ${url}`);
        }
        await pipeline(response.body, createWriteStream(temporary, {flags: "wx"}));
        try {
            // Exclusive copy also prevents overwriting a file created during download.
            await copyFile(temporary, destination, constants.COPYFILE_EXCL);
            console.log(`Downloaded: ${filename}`);
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            console.log(`Skipped: ${filename}`);
        }
    } finally {
        await rm(temporary, {force: true});
    }
}

async function getJson(url) {
    for (let attempt = 0; ; attempt++) {
        const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
        if (response.ok) return response.json();
        if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
            await response.body?.cancel();
            await delay(1000 * 2 ** attempt);
            continue;
        }
        throw new Error(`HTTP ${response.status}: ${url}`);
    }
}

// Preserve the original department / highlights / paintings / with-image filters.
// API documentation: https://metmuseum.github.io/
export async function printImageLinks(request = getJson, write = console.log) {
    const search = new URL(`${API}/v1.1/search`);
    search.search = new URLSearchParams({
        departmentId: "1", isHighlight: "true", hasImages: "true", medium: "Paintings", limit: "100",
    }).toString();

    const seenObjects = new Set();
    const seenImages = new Set();
    let offset = 0;
    while (true) {
        search.searchParams.set("offset", String(offset));
        const {total, objectIDs} = await request(search.href);
        if (!Number.isInteger(total) || total < 0 || (objectIDs !== null && !Array.isArray(objectIDs))) {
            throw new Error("Invalid search response from the Met API");
        }
        if (total > 10_000) {
            throw new Error("Search exceeds the API's 10,000-result limit; narrow the filters.");
        }
        if (total === 0) return;
        if (objectIDs === null) {
            throw new Error(`Search returned null objectIDs at offset ${offset} of ${total}`);
        }
        if (objectIDs.length === 0) {
            throw new Error(`Search returned an empty page at offset ${offset} of ${total}`);
        }
        for (const id of objectIDs) {
            if (seenObjects.has(id)) continue;
            seenObjects.add(id);
            const object = await request(`${API}/v1/objects/${id}`);
            // Some records with images do not expose an Open Access original.
            const image = object.primaryImage;
            if (typeof image === "string" && image.trim() && !seenImages.has(image)) {
                seenImages.add(image);
                await write(image);
            }
        }
        offset += objectIDs.length;
        if (offset >= total) return;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    printImageLinks(getJson, downloadImage).catch(error => {
        console.error(`Failed to download images: ${error.message}`);
        process.exitCode = 1;
    });
}
