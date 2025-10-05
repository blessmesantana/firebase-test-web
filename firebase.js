import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyB5n7xxHc45VINsoVKkTcXUuUm4TsMk8bg",
  authDomain: "perevozki-88c5b.firebaseapp.com",
  databaseURL: "https://perevozki-88c5b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "perevozki-88c5b",
  storageBucket: "perevozki-88c5b.appspot.com",
  messagingSenderId: "962120908044",
  appId: "1:962120908044:web:bd5a49937daf33d825dd29"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
