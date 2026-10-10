const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Note = mongoose.model('Note', new mongoose.Schema({
    topic: String,
    title: String,
    diagrams: Array,
    createdAt: Date
  }, { timestamps: true }));
  
  const notes = await Note.find({
    $or: [
      { topic: /algorithm/i },
      { 'diagrams.title': /Algorithmic Paradigm/i },
      { 'diagrams.title': /Decision Flow/i }
    ]
  }).sort({ createdAt: -1 }).limit(3);

  console.log('Matching notes count:', notes.length);
  for (const n of notes) {
    console.log('=== NOTE ID:', n._id.toString(), '===');
    console.log('Topic:', n.topic);
    console.log('Diagrams:');
    for (const d of n.diagrams) {
      console.log('  Type:', d.type);
      console.log('  Title:', d.title);
      console.log('  Data:\n', d.data);
      console.log('---------------------');
    }
  }
  await mongoose.disconnect();
})();
