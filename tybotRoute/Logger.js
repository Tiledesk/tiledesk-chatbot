let { Publisher } = require("@tiledesk/tiledesk-multi-worker");

const FLOW_LOGS_ENABLED = process.env.FLOW_LOGS_ENABLED;
const AMQP_MANAGER_URL = process.env.AMQP_MANAGER_URL;
const LOGS_BASE_ROUTING_KEY = process.env.LOGS_BASE_ROUTING_KEY || "apps.tilechat.logs";

const levels = { error: 0, warn: 1, info: 2, debug: 3, native: 4 };

let publisher = new Publisher(AMQP_MANAGER_URL, {
    debug: false,
    queueName: "logs_queue",
    exchange: "amq.topic"
})

console.log("LOGGER publisher: ", publisher);

class Logger {

    constructor(config) {

        if (!config) {
            throw new Error('config is mandatory');
        }

        if (!config.request_id) {
            console.error('(Logger) config.request_id is mandatory');
            this._disableMethods();
        }

        if (!FLOW_LOGS_ENABLED || FLOW_LOGS_ENABLED === false || FLOW_LOGS_ENABLED === 'false') {
            this._disableMethods();
        }

        if (!AMQP_MANAGER_URL) {
            this._disableMethods();
        }

        this.request_id = config.request_id;
        this.intent_id = config.intent_id;

        this.dev = false;
        if (config.dev && config.dev === true) {
            this.dev = true;
        } else {
            this._disableDebugMethods()
        }
        
    }

    error(...args) {
        let log = this.formatLog(args);
        return this.base('error', log);
    }

    warn(...args) {
        let log = this.formatLog(args);
        return this.base('warn', log);
    }

    info(...args) {
        let log = this.formatLog(args);
        return this.base('info', log);
    }

    debug(...args) {
        let log = this.formatLog(args);
        return this.base('debug', log);
    }

    native(...args) {
        let log = this.formatLog(args);
        return this.base('native', log);
    }

    base(level, text) {
        if (!this.request_id || !publisher) {
            console.log("Return because request or publisher is undefined", this.request_id, publisher);
            return;
        }

        let data = {
            request_id: this.request_id,
            id_project: this.request_id.split("-")[2],
            intent_id: this.intent_id,
            text: text,
            level: level,
            nlevel: levels[level],
            timestamp: new Date(),
            dev: this.dev
        }

        if (this.request_id.startsWith('automation') && this.request_id.split("-")[4]) {
            data.webhook_id = this.request_id.split("-")[4];
        }
        
        let topic = LOGS_BASE_ROUTING_KEY + `.${this.request_id}`;
        console.log("LOGGER publishing on topic ", topic)
        publisher.publish(data, topic);
        return;
    }

    formatLog(args) {
        return args
            .map(arg => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : arg))
            .join(" ")
    }

    // Substitute methods with empty function if flow flogs are disabled
    _disableMethods() {
        const methods = ['error', 'warn', 'info', 'debug', 'native'];
        methods.forEach(method => {
            this[method] = () => { };
        });
    }

    _disableDebugMethods() {
        const methods = ['debug', 'native'];
        methods.forEach(method => {
            this[method] = () => { };
        });
    }

}

module.exports = { Logger }