import "./style.css";
import { WebContainer } from "@webcontainer/api";
import { files } from "./files";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import { WebLinksAddon } from "xterm-addon-web-links";
import icons from "@exuanbo/file-icons-js";
import "@exuanbo/file-icons-js/dist/css/file-icons.min.css";
import "@exuanbo/file-icons-js/dist/fonts/devopicons.woff2";
import "@exuanbo/file-icons-js/dist/fonts/file-icons.woff2";
import "@exuanbo/file-icons-js/dist/fonts/fontawesome.woff2";
import "@exuanbo/file-icons-js/dist/fonts/mfixx.woff2";
import "@exuanbo/file-icons-js/dist/fonts/octicons.woff2";

document.querySelector("#app").innerHTML = `
    <div class="container">
      <div class="editor" style="height:300px; padding:0px;">
        <textarea id="file-content">Please open file to see context here...</textarea>
      </div>
      <div class="preview" style="height:300px;">
        <iframe src="loading.html"></iframe>
      </div>
     
      <div style="height:300px;" class="terminal">
      <div class="search-box">
      <input type="text" id="search-input" placeholder="Search in terminal" style="display: none;">
      <button id="search-next" >Next</button>
      <button id="search-previous" >Previous</button>
      <button id="close-search">X</button>
      <button id="scrollToTopBtn" title="Scroll to Top">↑</button>
      </div>
      </div>
      <div style="height:300px; overflow-y:auto;">
      <button  class="fileDisplay" style="height:30px">fileDisplay</button>
      <button  class="fileDisplayMui" style="height:30px">fileDisplayMui</button>
      <div style="height:260px; overflow-y:auto; position:relative;" id="fileTree">
      
      </div>
<div id="contextMenu">
  <button id="createFolder">Create Folder</button>
  <button id="createFile">Create File</button>
  <button id="renameFile">Rename</button>
  <button id="deleteFile">Delete</button>
</div>

      </div>
         <textarea style="height:300px;" class="fileSt" readonly></textarea>
         <textarea style="height:300px;" class="fileStMui" readonly></textarea>
      
    </div>
  `;

const iframeEl = document.querySelector("iframe");
const textareaEl = document.querySelector("#file-content");
const terminalEl = document.querySelector(".terminal");
const searchInput = document.getElementById("search-input");
const searchNextBtn = document.getElementById("search-next");
const searchPreviousBtn = document.getElementById("search-previous");
const closeSearch = document.getElementById("close-search");
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
const fileTreeElement = document.getElementById("fileTree");
const contextMenu = document.getElementById("contextMenu");
const createFolder = document.getElementById("createFolder");
const createFile = document.getElementById("createFile");
const fileDisplayBtn = document.querySelector(".fileDisplay");
const fileSt = document.querySelector(".fileSt");
const fileStMui = document.querySelector(".fileStMui");
const fileDisplayMuiBtn = document.querySelector(".fileDisplayMui");

/** @type {import('@webcontainer/api').WebContainer} */
let webcontainerInstance;
let fileTree = {}; // Initialize an empty file tree
let previousFileTree = null; // Initialize a variable to keep track of the previous file tree
// Define a variable to keep track of the active file
let activeFile = null;
let terminal = null;
let searchAddon = null;
let fitAddon = null;
let activeFileElement = null;
let activeFolderElement = null;

// Function to set the active file
async function setActiveFile(filePath) {
  activeFile = filePath;

  // Remove the "active-file" class from the previously active file
  if (activeFileElement) {
    activeFileElement.classList.remove("active-file");
  }

  // Find the corresponding file element and add the "active-file" class
  activeFileElement = fileTreeElement.querySelector(`[data-file-path="${filePath}"]`);
  if (activeFileElement) {
    activeFileElement.classList.add("active-file");
  }
}

window.addEventListener("load", async () => {
  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();

  terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
  });
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.open(terminalEl);

  fitAddon.fit();
  searchAddon.activate(terminal);

  console.log("Booting WebContainer...");
  webcontainerInstance = await WebContainer.boot();
  await webcontainerInstance.mount(files);
  console.log("Webcontainer booted successfully!");

  webcontainerInstance.on("server-ready", (port, url) => {
    iframeEl.src = url;
  });

  await readFiles("/", 0, fileTreeElement);

  const shellProcess = await startShell(terminal);
  window.addEventListener("resize", () => {
    fitAddon.fit();
    shellProcess.resize({
      cols: terminal.cols,
      rows: terminal.rows,
    });
  });

  // await installDependenciesAndStartServer(terminal);

  // Interval in milliseconds for checking file changes
  const fileCheckInterval = 2000; // 5 seconds

  const fileChangeIntervalId = setInterval(checkFileChanges, fileCheckInterval);

  window.addEventListener("beforeunload", async () => {
    clearInterval(fileChangeIntervalId);
    await removeFiles("/");
  });
});

// Function to check for file changes
async function checkFileChanges() {
  const currentFileTree = await getFileTree("/");

  if (!areFileTreesEqual(previousFileTree, currentFileTree)) {
    // File tree has changed, update the UI
    updateFileTree(currentFileTree);
  }

  previousFileTree = currentFileTree;
}

// Function to compare two file trees
function areFileTreesEqual(tree1, tree2) {
  return JSON.stringify(tree1) === JSON.stringify(tree2);
}

// Function to update the file tree UI
function updateFileTree(fileTree) {
  // Clear the existing file tree UI
  fileTreeElement.innerHTML = "";

  // Render the updated file tree
  readFiles("/", 0, fileTreeElement);
}

// Function to get the current file tree
async function getFileTree(directory) {
  const files = await webcontainerInstance.fs.readdir(directory, {
    withFileTypes: true,
  });

  const fileTree = {};

  for (const file of files) {
    if (file.isDirectory()) {
      const subDirectory = `${directory}/${file.name}`;
      fileTree[file.name] = await getFileTree(subDirectory);
    } else {
      fileTree[file.name] = "file";
    }
  }

  return fileTree;
}

async function readFiles(
  directory = "/",
  depth = 0,
  parentElement = document.body
) {
  const files = await webcontainerInstance.fs.readdir(directory, {
    withFileTypes: true,
  });

  const folders = [];
  const filesList = [];

  // Separate folders and files
  for (const file of files) {
    if (file.isDirectory()) {
      folders.push(file);
    } else {
      filesList.push(file);
    }
  }

  // Sort folders and files in ascending order
  folders.sort((a, b) => a.name.localeCompare(b.name));
  filesList.sort((a, b) => a.name.localeCompare(b.name));

  const ul = document.createElement("ul");

  // Process and display folders
  for (const folder of folders) {
    const indent = "  ".repeat(depth); // Indentation based on the depth
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = folder.name;

    const details = document.createElement("details");
    details.classList.add("folder");
    details.setAttribute("data-folder-path", `${directory}/${folder.name}`);
    details.style.marginLeft = `${depth * 20}px`; // Adjust margin based on depth

    const summary = document.createElement("summary");
    summary.textContent = `${indent}${folder.name}`;

    details.appendChild(summary);

    const subDirectory = `${directory}/${folder.name}`;
    await readFiles(subDirectory, depth + 1, details);
    li.appendChild(details);
    ul.appendChild(li);
  }

  // Process and display files with icons
  for (const file of filesList) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = file.name;

    span.classList.add("file");
    span.setAttribute("data-file-path", `${directory}/${file.name}`);

    // Get the icon class for the file name
    const iconClass = await getIconClass(file.name, false);
    if (iconClass) {
      // Create an icon element and set its class
      const iconElement = document.createElement("i");
      iconElement.className = `icon ${iconClass}`;
      li.appendChild(iconElement);
    }

    li.appendChild(span);

    const filePath = `${directory}/${file.name}`;
    span.addEventListener("click", async () => {
      const fileContent = await getFileContent(filePath);
      showFileContent(file.name, fileContent);

      // Set the active file to the currently selected file
      setActiveFile(filePath);
    });

    // Add event listener for renaming files on F2 key press
  li.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const contextMenu = document.getElementById("contextMenu");
    const renameFile = document.getElementById("renameFile");
    const deleteFile = document.getElementById("deleteFile");
    renameFile.onclick = async () => {
      const currentFileName = file.name;
      const newName = prompt(`Enter the new name for "${currentFileName}":`);
      if (newName) {
        if (newName !== currentFileName) {
          await renameItem(filePath, newName);
        } else {
          alert("Please enter a different name.");
        }
      }
      contextMenu.style.display = "none";
    };
    deleteFile.onclick = async () => {
      if (filePath === "/") {
        alert("You cannot delete the root folder.");
        return;
      }
      const confirmDelete = confirm(`Are you sure you want to delete "${file.name}"?`);
      if (confirmDelete) {
        await deleteFolderRecursive(filePath);
        contextMenu.style.display = "none";
      }
    };
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.display = "block";
  });

    ul.appendChild(li);
  }

  parentElement.appendChild(ul);
}

async function getIconClass(name, isDirectory) {
  try {
    // Check if it's a directory or a file
    if (!isDirectory) {
      const options = {
        color: true, // You can set this to false if you don't want color in the icon class
      };

      // Use the file name to get the file icon
      const fileIconClass = await icons.getClass(name, options);
      return fileIconClass;
    }
  } catch (error) {
    // Handle any errors (e.g., if the icon is not found)
    console.error("Error getting icon class:", error);
  }
  return null; // Return null for folders or in case of errors
}

async function getFileContent(filePath) {
  const file = await webcontainerInstance.fs.readFile(filePath, "utf-8");
  return file;
}

function showFileContent(fileName, content) {
  textareaEl.value = content;

  textareaEl.addEventListener("input", (e) => {
    // Write content to the file, but only if it's the active file
    writeToFile(activeFile, e.currentTarget.value);
  });
}

// Function to write content to a file, but only if it's the active file
async function writeToFile(filePath, content) {
  if (activeFile === filePath) {
    await webcontainerInstance.fs.writeFile(filePath, content);
  }
}

async function removeFiles(directory) {
  const files = await webcontainerInstance.fs.readdir(directory, {
    withFileTypes: true,
  });

  for (const file of files) {
    const filePath = `${directory}/${file.name}`;

    if (file.isDirectory()) {
      await removeFiles(filePath); // Recursive call to delete files inside the subdirectory
      await webcontainerInstance.fs.rm(filePath, { recursive: true }); // Delete the subdirectory
    } else {
      await webcontainerInstance.fs.rm(filePath); // Delete the file
    }
  }
}

async function installDependencies(terminal) {
  // Install dependencies
  const installProcess = await webcontainerInstance.spawn("npm", ["install"]);
  installProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data);
      },
    })
  );
  // Wait for install command to exit
  return installProcess.exit;
}

async function startServer(terminal) {
  const serverProcess = await webcontainerInstance.spawn("npm", [
    "run",
    "start",
  ]);
  serverProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data);
      },
    })
  );
  return serverProcess;
}

async function installDependenciesAndStartServer(terminal) {
  try {
    // First, install dependencies
    const installD = await installDependencies(terminal);

    // If installation is successful, start the server
    if (installD === 0) {
      await startServer(terminal);
    }

    console.log("Application is ready.");
  } catch (error) {
    console.error("Error:", error);
  }
}

async function startShell(terminal) {
  const shellProcess = await webcontainerInstance.spawn("jsh", {
    terminal: {
      cols: terminal.cols,
      rows: terminal.rows,
    },
  });
  shellProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        terminal.write(data);
      },
    })
  );

  const input = shellProcess.input.getWriter();

  terminal.onData((data) => {
    input.write(data);
  });

  return shellProcess;
}

// async  function displayFolderAndFileStructure() {
//   // Get the current file tree
//   const currentFileTree = await getFileTree('/');

//   // Convert the file tree to a string for display
//   const fileTreeString = JSON.stringify(currentFileTree, null, 2);

//   // Set the content of the textarea to the file tree string
//  return fileTreeString;
// }

// async function displayFolderAndFileStructure(directory = '/', fileTree = {}) {
//   const files = await webcontainerInstance.fs.readdir(directory, { withFileTypes: true });

//   for (const file of files) {
//     if (file.isDirectory()) {
//       const subDirectory = `${directory}/${file.name}`;
//       fileTree[file.name] = {
//         directory: {},
//       };
//       await displayFolderAndFileStructure(subDirectory, fileTree[file.name].directory);
//     } else {
//       const filePath = `${directory}/${file.name}`;
//       const fileContent = await getFileContent(filePath);
//       fileTree[file.name] = {
//         file: {
//           contents: fileContent,
//         },
//       };
//     }
//   }

//   return fileTree;
// }

async function displayFolderAndFileStructure(directory = "/", depth = 0) {
  const files = await webcontainerInstance.fs.readdir(directory, {
    withFileTypes: true,
  });

  const folders = [];
  const filesList = [];

  // Separate folders and files
  for (const file of files) {
    if (file.name === "node_modules" || file.name === "package-lock.json") {
      // Skip the node_modules directory
      continue;
    }
    if (file.isDirectory()) {
      folders.push(file);
    } else {
      filesList.push(file);
    }
  }

  // Sort folders and files in ascending order
  folders.sort((a, b) => a.name.localeCompare(b.name));
  filesList.sort((a, b) => a.name.localeCompare(b.name));

  let structure = {};

  // Process and add folders
  for (const folder of folders) {
    const subDirectory = `${directory}/${folder.name}`;
    structure[folder.name] = {
      directory: await displayFolderAndFileStructure(subDirectory, depth + 1),
    };
  }

  // Process and add files
  for (const file of filesList) {
    const filePath = `${directory}/${file.name}`;
    const fileContent = await getFileContent(filePath);
    structure[file.name] = {
      file: {
        contents: fileContent,
      },
    };
  }

  return structure;
}

let globalIdCounter = 1;
async function displayFolderAndFileStructureWithIds(
  directory = "/",
  depth = 0
) {
  const files = await webcontainerInstance.fs.readdir(directory, {
    withFileTypes: true,
  });

  const folders = [];
  const filesList = [];

  // Separate folders and files
  for (const file of files) {
    if (file.isDirectory()) {
      folders.push(file);
    } else {
      filesList.push(file);
    }
  }

  // Sort folders and files in ascending order
  folders.sort((a, b) => a.name.localeCompare(b.name));
  filesList.sort((a, b) => a.name.localeCompare(b.name));

  let structure = {
    id: globalIdCounter.toString(),
    name: directory === "/" ? "Parent" : directory.split("/").pop(),
    children: [],
  };

  globalIdCounter++; // Increment the global ID counter

  // Process and add folders
  for (const folder of folders) {
    const subDirectory = `${directory}/${folder.name}`;
    structure.children.push(
      await displayFolderAndFileStructureWithIds(subDirectory, depth + 1)
    );
  }

  // Process and add files
  for (const file of filesList) {
    structure.children.push({
      id: globalIdCounter.toString(),
      name: file.name,
    });
    globalIdCounter++; // Increment the global ID counter
  }

  // Reset globalIdCounter to 1 when the function completes
  if (directory === "/") {
    globalIdCounter = 1;
  }

  return structure;
}

let selectedFolder = null; // Initialize a variable to store the selected folder
//mv
async function renameWithMv(oldPath, newPath) {
  try {
    // Use the webcontainerInstance.spawn method to run the 'mv' command
    const result = await webcontainerInstance.spawn("mv", [oldPath, newPath]);

    if (result) {
      console.log(`Renamed ${oldPath} to ${newPath}`);
      return true; // Successful rename
    }
  } catch (error) {
    console.error(`Error renaming ${oldPath} to ${newPath}:`, error);
    return false; // Rename failed due to an error
  }
}

async function renameItem(itemPath, newName) {
  if (itemPath && newName) {
    try {
      const isFolder = itemPath === selectedFolder;

      // Check if the selected folder is "node_modules" and prevent renaming
      if (isFolder && selectedFolder === "//node_modules") {
        alert("You cannot rename the 'node_modules' folder.");
        return; // Exit the function without renaming
      }

      // Remove double slashes from the start of itemPath
      if (itemPath.startsWith("//")) {
        itemPath = itemPath.substring(2); // Remove the first slash
      }
      // Rename the item using the renameWithMv function
      const parentDirectory = itemPath.substring(0, itemPath.lastIndexOf("/"));
      let newPath = `${parentDirectory}/${newName}`;
      if (newPath.startsWith("/")) {
        newPath = newPath.substring(1); // Remove the first slash
      }
      const isRenameSuccessful = await renameWithMv(itemPath, newPath);

      if (isRenameSuccessful) {
        if (isFolder) {
          selectedFolder = null;
        } else {
          activeFile = newPath;
        }

        // Update the file tree UI
        const currentFileTree = await getFileTree("/");
        updateFileTree(currentFileTree);
      } else {
        alert(`Failed to rename ${itemPath} to ${newPath}.`);
      }
    } catch (error) {
      console.error("Error renaming item:", error);
    }
  }
}

//rename with copy and delete
// async function renameItem(itemPath, newName) {
//   if (itemPath && newName) {
//     try {
//       const isFolder = itemPath === selectedFolder;

//       if (isFolder && selectedFolder === '//node_modules') {
//         alert("You cannot rename the 'node_modules' folder.");
//         return; // Exit the function without renaming
//       }

//       if (isFolder) {
//         const parentDirectory = itemPath.substring(0, itemPath.lastIndexOf("/"));
//         const newFolderPath = `${parentDirectory}/${newName}`;
//         await webcontainerInstance.fs.mkdir(newFolderPath, { recursive: true });
//         await copyFolderContents(itemPath, newFolderPath);
//         await deleteFolderRecursive(itemPath);
//         selectedFolder = null;
//       } else {
//         const fileContent = await getFileContent(itemPath);
//         const directory = itemPath.substring(0, itemPath.lastIndexOf("/"));
//         const newFilePath = `${directory}/${newName}`;
//         await webcontainerInstance.fs.writeFile(newFilePath, fileContent);
//         await webcontainerInstance.fs.rm(itemPath);
//         activeFile = null;
//       }

//       // Update the file tree UI
//       const currentFileTree = await getFileTree("/");
//       updateFileTree(currentFileTree);
//     } catch (error) {
//       console.error("Error renaming item:", error);
//     }
//   }
// }

// async function copyFileWithStream(sourcePath, destinationPath) {
//   try {
//     // Read the content of the source file
//     const fileContent = await webcontainerInstance.fs.readFile(sourcePath, 'utf-8');

//     // Write the content to the destination file
//     await webcontainerInstance.fs.writeFile(destinationPath, fileContent, 'utf-8');

//     return Promise.resolve();
//   } catch (error) {
//     return Promise.reject(error);
//   }
// }

// async function copyFolderContents(sourceFolder, destinationFolder) {
//   console.log(`Copying contents from ${sourceFolder} to ${destinationFolder}`);
//   const files = await webcontainerInstance.fs.readdir(sourceFolder, {
//     withFileTypes: true,
//   });

//   for (const file of files) {
//     const sourcePath = `${sourceFolder}/${file.name}`;
//     const destinationPath = `${destinationFolder}/${file.name}`;

//     if (file.isDirectory()) {
//       await webcontainerInstance.fs.mkdir(destinationPath, { recursive: true });
//       await copyFolderContents(sourcePath, destinationPath);
//     } else {
//       await copyFileWithStream(sourcePath, destinationPath);
//     }
//   }
//   console.log(`Finished copying contents from ${sourceFolder} to ${destinationFolder}`);
// }

// // Function to delete folders and their contents recursively
async function deleteFolderRecursive(folderPath) {
  console.log(`Deleting folder and contents at ${folderPath}`);

  // Delete the folder itself
  await webcontainerInstance.fs.rm(folderPath,{recursive:true});
  console.log(`Finished deleting folder and contents at ${folderPath}`);
}



// Event listener to capture the selected folder when it's clicked
fileTreeElement.addEventListener("click", (event) => {
  const target = event.target;
  const isFolder =
    target.classList.contains("folder") ||
    target.parentElement.classList.contains("folder");

  if (isFolder) {
    // Remove the "active-folder" class from the previously active folder
    if (activeFolderElement) {
      activeFolderElement.classList.remove("active-folder");
    }

    const folderElement = target.closest(".folder");
    selectedFolder = folderElement.getAttribute("data-folder-path");
    activeFolderElement = folderElement;

    // Add the "active-folder" class to the newly active folder
    activeFolderElement.classList.add("active-folder");

    // Clear the active file when selecting a folder
    setActiveFile(null);
  } else {
    // User clicked on a file, clear the active folder
    selectedFolder = null;

    // Remove the "active-folder" class from the previously active folder
    if (activeFolderElement) {
      activeFolderElement.classList.remove("active-folder");
    }

    // Set the active file
    const filePath = selectedFolder ? `${selectedFolder}/${target.textContent}` : target.textContent;
    setActiveFile(filePath);
  }
});

// Add an event listener to listen for the F2 key press
document.addEventListener("keydown", async (event) => {
  if (event.key === "F2") {
    if (activeFile && !selectedFolder) {
      // Handle renaming of the active file
      const currentFileName = activeFile.split("/").pop();
      const newName = prompt(`Enter the new name for "${currentFileName}":`);
      if (newName) {
        if (newName !== currentFileName) {
          await renameItem(activeFile, newName);
        } else {
          alert("Please enter a different name.");
        }
      }
    } else if (selectedFolder) {
      // Handle renaming of the selected folder
      const currentFolderName = selectedFolder.split("/").pop();
      const newName = prompt(`Enter the new name for "${currentFolderName}":`);
      if (newName) {
        if (newName !== currentFolderName) {
          await renameItem(selectedFolder, newName);
        } else {
          alert("Please enter a different name.");
        }
      }
    }
  }
  else if(event.key === "Delete"){
    // console.log(event.key);
    if(selectedFolder === '/'){
      alert('You cannot delete root folder');
      return;
    }else{

      deleteFolderRecursive(selectedFolder || activeFile);
    }
  }
});

//search functionality in terminal
terminalEl.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === "F") {
    console.log(event);
    // Show the search input field
    searchInput.style.display = "block";
    searchNextBtn.style.display = "block";
    searchPreviousBtn.style.display = "block";
    closeSearch.style.display = "block";
    searchInput.focus(); // Focus on the input field for immediate typing
    event.preventDefault(); // Prevent the browser's default search action
  }
});

searchInput.addEventListener("input", () => {
  const searchTerm = searchInput.value;
  console.log(searchTerm);

  // Perform the search within the terminal using the SearchAddon
  if (searchTerm) {
    searchAddon.findNext(searchTerm);
  } else {
    // If the search term is empty, clear the search highlights
    searchAddon.clearSelection();
  }
});

// Add an event listener for the "Next" button
searchNextBtn.addEventListener("click", () => {
  const searchTerm = searchInput.value;
  if (searchTerm) {
    searchAddon.findNext(searchTerm);
  }
});

// Add an event listener for the "Previous" button
searchPreviousBtn.addEventListener("click", () => {
  const searchTerm = searchInput.value;
  if (searchTerm) {
    searchAddon.findPrevious(searchTerm);
  }
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchInput.style.display = "none";
    searchNextBtn.style.display = "none";
    searchPreviousBtn.style.display = "none";
    closeSearch.style.display = "none";
    event.preventDefault();
  }
});

closeSearch.addEventListener("click", () => {
  searchInput.style.display = "none";
  searchNextBtn.style.display = "none";
  searchPreviousBtn.style.display = "none";
  closeSearch.style.display = "none";
});

// ------------------------------------------------------------

fileDisplayBtn.addEventListener("click", async () => {
  // const fileTreeStructure = await displayFolderAndFileStructure('/');
  // const fileTreeString = JSON.stringify(fileTreeStructure, null, 2);
  // fileSt.value = fileTreeString;

  const fileTreeContent = await displayFolderAndFileStructure("/");
  const formattedFileTree = JSON.stringify(
    fileTreeContent,
    (key, value) => {
      if (key === "contents" && typeof value === "string") {
        // Replace '\n' with actual newlines in the file content
        return value.replace(/\\n/g, "\n");
      }
      return value;
    },
    2
  );

  fileSt.value = formattedFileTree;
});

fileDisplayMuiBtn.addEventListener("click", async () => {
  const fileTreeContent = await displayFolderAndFileStructureWithIds("/");
  const formattedFileTree = JSON.stringify(fileTreeContent, null, 2);
  fileStMui.value = formattedFileTree;
});

//scrolltotop button in terminal
scrollToTopBtn.addEventListener("click", () => {
  terminal.scrollToTop();
});


function resetFilePath(){
  selectedFolder = '/';
}

fileTreeElement.addEventListener("click", (event) => {
  if (event.target.classList.contains('folder')) {
    resetFilePath();
  } else if (!event.target.closest('ul')) {
    resetFilePath();
  }
});

async function createFolderFunction() {
  const folderName = prompt("Enter folder name:");
  if (folderName) {
    try {
      // Determine the current path based on whether a folder is selected or not
      let currentPath = "/";
      if (selectedFolder) {
        currentPath = selectedFolder;
      } else if (activeFile) {
        currentPath = activeFile;
      }

      // Create the new folder path
      const newFolderPath = `${currentPath}/${folderName}`;

      // Check if the folder already exists by attempting to read it
      try {
        await webcontainerInstance.fs.readdir(newFolderPath);
        alert("Folder already exists.");
        return; // Exit the function if the folder exists
      } catch (error) {
        // If the folder doesn't exist, proceed to create it
      }

      // Create the new folder
      await webcontainerInstance.fs.mkdir(newFolderPath);

      // Append the new folder to the file tree UI
      const folderElement = document.createElement("details");
      folderElement.classList.add("folder");
      folderElement.setAttribute("data-folder-path", newFolderPath);
      folderElement.style.marginLeft = `${currentPath.split("/").length * 20}px`; // Adjust margin based on depth
      folderElement.innerHTML = `
        <summary>${folderName}</summary>
        <ul></ul>
      `;

      // Find the parent folder or root element to append the new folder
      let parentElement;
      if (selectedFolder) {
        parentElement = fileTreeElement.querySelector(`[data-folder-path="${selectedFolder}"]`);
      } else {
        parentElement = fileTreeElement; // Append to the root element if no folder is selected
      }

      if (parentElement) {
        const ulElement = parentElement.querySelector("ul");
        ulElement.appendChild(folderElement);
      }
    } catch (error) {
      console.error("Error creating folder:", error);
    }
  }
}

selectedFolder = '/';
async function createFileFunction() {
  const fileName = prompt("Enter file name:");
  if (fileName) {
    try {
      // Check if a folder is selected

      if (selectedFolder) {
        // Create the new file path
        const newFilePath = `${selectedFolder}/${fileName}`;

        // Check if the file already exists by attempting to read it
        try {
          await webcontainerInstance.fs.readFile(newFilePath);
          alert("File already exists.");
          return; // Exit the function if the file exists
        } catch (error) {
          // If the file doesn't exist, proceed to create it
        }

        // Use the WebContainer API to create the file within the selected folder
        await webcontainerInstance.fs.writeFile(newFilePath, "");

        // Append the new file to the file tree UI
        const fileElement = document.createElement("li");
        fileElement.classList.add("file");
        fileElement.textContent = fileName;

        // Find the selected folder element to append the new file
        const folderElement = fileTreeElement.querySelector(`[data-folder-path="${selectedFolder}"]`);
        if (folderElement) {
          const ulElement = folderElement.querySelector("ul");
          ulElement.appendChild(fileElement);
        }
      } else {
        console.error("No folder selected to create the file in.");
      }
    } catch (error) {
      console.error("Error creating file:", error);
    }
  }
}


//context menu for adding file and folder in filetree
fileTreeElement.addEventListener("contextmenu", (event) => {
 if(webcontainerInstance){
  event.preventDefault(); // Prevent the default browser context menu from showing

  // Position the context menu at the mouse cursor's position relative to the container
  contextMenu.style.left = `${event.clientX}px`;
  contextMenu.style.top = `${event.clientY}px`;

  // Display the context menu
  contextMenu.style.display = "block";
 }else{
    alert("Please wait for the container to start.")
 }

});

createFolder.addEventListener("click", async(event) => {
  await createFolderFunction();
  contextMenu.style.display = 'none';
});

createFile.addEventListener("click", async(event) => {
  await createFileFunction();
  contextMenu.style.display = 'none';
});

document.addEventListener("click", () => {
  contextMenu.style.display = "none";
});

contextMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});
