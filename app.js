
import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    deleteDoc,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// --- DOM Elements ---
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsContainer = document.getElementById('search-results');
const searchQueryDisplay = document.getElementById('search-query-display');
const loadingSpinner = document.getElementById('loading-spinner');

const wantToReadContainer = document.getElementById('library-want-to-read');
const readContainer = document.getElementById('library-read');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// --- State ---
let searchResultsData = [];
const NO_COVER_IMAGE = 'no_cover.png';

// --- Initialize App ---
function init() {
    setupEventListeners();

    // Attempt to load library from Firestore, but wrap in try-catch 
    // since config might be uninitialized placeholders
    try {
        loadLibraryRealtime();
    } catch (error) {
        console.warn("Firebase not fully configured yet. Please update firebase-config.js", error);
    }
}

function setupEventListeners() {
    searchForm.addEventListener('submit', handleSearch);

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            // Update tabs
            tabButtons.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            // Update content
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.classList.add('hidden');
                if (content.id === `library-${tabId}`) {
                    content.classList.remove('hidden');
                    content.classList.add('active');
                }
            });
        });
    });
}

// --- Search Flow ---
async function handleSearch(e) {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    searchQueryDisplay.textContent = `for "${query}"`;
    searchResultsContainer.innerHTML = '';
    loadingSpinner.classList.remove('hidden');

    try {
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();

        searchResultsData = data.docs.map(doc => ({
            id: doc.key,
            title: doc.title,
            author: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
            coverUrl: doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                : NO_COVER_IMAGE
        }));

        renderSearchResults();
    } catch (error) {
        console.error("Error fetching books:", error);
        searchResultsContainer.innerHTML = `<p style="color: #ef4444;">Failed to fetch results. Please try again.</p>`;
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

function renderSearchResults() {
    if (searchResultsData.length === 0) {
        searchResultsContainer.innerHTML = `<p style="color: var(--text-muted)">No books found.</p>`;
        return;
    }

    searchResultsContainer.innerHTML = searchResultsData.map((book, index) => `
        <div class="book-card" style="animation: fadeIn 0.4s ease ${index * 0.05}s forwards; opacity: 0;">
            <img src="${book.coverUrl}" alt="${book.title} cover" class="book-cover" onerror="this.src='${NO_COVER_IMAGE}'">
            <div class="book-info">
                <h3 class="book-title" title="${book.title}">${book.title}</h3>
                <p class="book-author">${book.author}</p>
                <div class="book-actions">
                    <button class="btn-save" onclick="saveBook(${index})">
                        Save to Library
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// --- Firebase Operations ---

window.saveBook = async function (index) {
    const book = searchResultsData[index];
    try {
        await addDoc(collection(db, "books"), {
            openLibraryId: book.id,
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            status: 'want-to-read',
            addedAt: new Date()
        });
        alert(`"${book.title}" saved to your reading list!`);
    } catch (error) {
        console.error("Error saving book:", error);
        alert("Make sure your Firebase configuration is correct in firebase-config.js.");
    }
}

window.updateBookStatus = async function (id, newStatus) {
    try {
        const bookRef = doc(db, "books", id);
        await updateDoc(bookRef, { status: newStatus });
    } catch (error) {
        console.error("Error updating book:", error);
    }
}

window.deleteBook = async function (id) {
    if (!confirm("Are you sure you want to remove this book?")) return;
    try {
        await deleteDoc(doc(db, "books", id));
    } catch (error) {
        console.error("Error deleting book:", error);
    }
}

// --- Library Rendering ---
function loadLibraryRealtime() {
    const booksRef = collection(db, "books");

    // Realtime listener
    onSnapshot(booksRef, (snapshot) => {
        const books = [];
        snapshot.forEach((doc) => {
            books.push({ id: doc.id, ...doc.data() });
        });

        renderLibrary(books);
    }, (error) => {
        console.error("Firestore Error (Ignore if not configured yet):", error);
    });
}

function renderLibrary(books) {
    const wantToRead = books.filter(b => b.status === 'want-to-read');
    const read = books.filter(b => b.status === 'read');

    wantToReadContainer.innerHTML = wantToRead.length > 0
        ? wantToRead.map(book => generateLibraryCard(book)).join('')
        : `<p style="color: var(--text-muted); grid-column: 1/-1;">No books in this list yet.</p>`;

    readContainer.innerHTML = read.length > 0
        ? read.map(book => generateLibraryCard(book)).join('')
        : `<p style="color: var(--text-muted); grid-column: 1/-1;">No books in this list yet.</p>`;
}

function generateLibraryCard(book) {
    const isRead = book.status === 'read';

    return `
        <div class="book-card">
            <img src="${book.coverUrl}" alt="${book.title} cover" class="book-cover" onerror="this.src='${NO_COVER_IMAGE}'">
            <div class="book-info">
                <h3 class="book-title" title="${book.title}">${book.title}</h3>
                <p class="book-author">${book.author}</p>
                <div class="book-actions">
                    ${!isRead
            ? `<button class="btn-action read" onclick="updateBookStatus('${book.id}', 'read')">Mark as Read</button>`
            : `<button class="btn-action want-read" onclick="updateBookStatus('${book.id}', 'want-to-read')">Move to Want to Read</button>`
        }
                    <button class="btn-delete" title="Remove" onclick="deleteBook('${book.id}')">✕</button>
                </div>
            </div>
        </div>
    `;
}

// Start app
init();
