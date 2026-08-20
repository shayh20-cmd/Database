import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

// Public client config — not a secret, safe to commit. Firestore access is governed by
// firestore.rules, not by keeping this value hidden.
const firebaseConfig = {
  apiKey: 'AIzaSyA2dHvBHfjtS4T2vSol_a7SC47w-QPqCw8',
  authDomain: 'knafo-klimor-fun-day.firebaseapp.com',
  projectId: 'knafo-klimor-fun-day',
  storageBucket: 'knafo-klimor-fun-day.firebasestorage.app',
  messagingSenderId: '821085636157',
  appId: '1:821085636157:web:0c39c6b9a02e1bbd9b4c54',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
