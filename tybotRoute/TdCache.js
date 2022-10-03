const redis = require('redis');

class TdCache {

    constructor(config) {
        this.redis_host = config.host;
        this.redis_port = config.port;
        this.redis_password = config.password;
        this.client = null;
    }

    async connect(callback) {
        // client = redis.createClient();
        return new Promise( async (resolve, reject) => {
            this.client = redis.createClient({
                socket: {
                    host: this.redis_host,
                    port: this.redis_port
                },
                password: this.redis_password
            });
            this.client.on('error', err => {
                console.log('Redis Error', err);
                reject(err);
                if (callback) {
                    callback(err);
                }
            });
            // this.client.on('connect', function() {
            //     console.log('Redis Connected!');
            // });
            // this.client.on('ready',function() {
            //     console.log("Redis is ready");
            // });
            try {
                await this.client.connect();
            }
            catch (error) {
                console.error(error)
                process.exit(0);
            }
            resolve();
            if (callback) {
                callback();
            }
            console.log("Connected...");
        });
    }

    async set(key, value, callback) {
        return new Promise( async (resolve, reject) => {
            await this.client.set(key, value);
            if (callback) {
                callback();
            }
            return resolve();
        })
    }

    async get(key, callback) {
        return new Promise( async (resolve, reject) => {
            const value = await this.client.get(key);
            if (callback) {
                callback(value);
            }
            return resolve(value);
        });
    }

    async del(key, callback) {
        return new Promise( async (resolve, reject) => {
            await this.client.del(key);
            if (callback) {
                callback();
            }
            return resolve();
        })
    }
}

module.exports = { TdCache };