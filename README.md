# download_paintings
A simple spider that download public painting images from https://www.metmuseum.org/

# How to use
1. `npm install`
2. `npm start`

Images are saved to the `downloads` folder next to `index.js`, using their original
filenames. Existing files with the same name are skipped. Run the script again to
resume after a failure; incomplete downloads are cleaned up automatically.
