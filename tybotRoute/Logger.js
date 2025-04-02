let { Publisher } = require("@tiledesk/tiledesk-multi-worker");

const FLOW_LOGS_ENABLED = process.env.FLOW_LOGS_ENABLED;
const AMQP_MANAGER_URL = process.env.AMQP_MANAGER_URL;
const LOGS_BASE_ROUTING_KEY = process.env.LOGS_BASE_ROUTING_KEY || "apps.tilechat.logs";

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

let publisher = new Publisher(AMQP_MANAGER_URL, {
    debug: false,
    queueName: "logs_queue",
    exchange: "amq.topic"
})

class Logger {

    constructor(config) {

        if (!config) {
            throw new Error('config is mandatory');
        }

        if (!config.request_id) {
            console.error('config.request_id is mandatory');
            //throw new Error('config.request_id is mandatory');
        }

        if (!FLOW_LOGS_ENABLED || FLOW_LOGS_ENABLED === false || FLOW_LOGS_ENABLED === 'false') {
            //console.warn("(Logger) Flow logs disabled");
            this._disableMethods();
        }

        if (!AMQP_MANAGER_URL) {
            //console.warn("(Logger) No AQMP Manager url provided. Flow logs disabled");
            this._disableMethods();
        }

        this.request_id = config.request_id;

        this.dev = false;
        if (config.dev && config.dev === true) {
            this.dev = true;
        } else {
            this._disableDebugMethods()
        }

        // if (!AMQP_MANAGER_URL) {
        //     console.error('AMQP_MANAGER_URL is undefined. Logger not available...');
        //     return;
        //     //throw new Error("Error starting logger: AMQP_MANAGER_URL is undefined.")
        // }

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

    base(level, text) {
        if (!this.request_id || !publisher) {
            console.log("Return because request or publisher is undefined", this.request_id, publisher);
            return;
        }

        let data = {
            request_id: this.request_id,
            id_project: request_id.split("-")[2],
            text: text,
            level: level,
            nlevel: levels[level],
            timestamp: new Date(),
            dev: this.dev
        }

        let topic = LOGS_BASE_ROUTING_KEY + `.${this.request_id}`;
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
        const methods = ['error', 'warn', 'info', 'debug'];
        methods.forEach(method => {
            this[method] = () => { };
        });
    }

    _disableDebugMethods() {
        const method = 'debug';
        this[method] = () => { };
    }

}

module.exports = { Logger }