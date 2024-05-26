/**
 * Only prototype code for the new "Code orchestrator"
 */
class Context {
    constructor(env) {this.attributes = env;this.ops = {set: {},del: {} } }  setAttribute(key, value) { this.ops.set[key] = value; }
    deleteAttribute(key) { this.ops.del[key] = true; }
    allAttributes() { return this.attributes; }
}
