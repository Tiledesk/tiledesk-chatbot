// Same switch as tiledesk-server. Blocks only when PINECONE_WRITE_DISABLED=true.
// Absent or false leaves writes enabled.
function vectorStoreWritesFrozen() {
  return process.env.PINECONE_WRITE_DISABLED === 'true';
}

module.exports = { vectorStoreWritesFrozen };
