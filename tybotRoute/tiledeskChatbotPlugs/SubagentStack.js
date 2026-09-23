class SubagentStack {

    constructor(options) {
        if (!options) {
            throw new Error('(SubagentStack) options object is mandatory.');
        }
        if (!options.tdCache) {
            throw new Error('(SubagentStack) options.tdCache object is mandatory.');
        }

        this.tdCache = options.tdCache;
    }

    static CONSUMED_MESSAGE_TTL_SECONDS = 300;

    stackKey(requestId) {
        return `subagent:stack:${requestId}`;
    }

    consumedMessageKey(requestId) {
        return `subagent:consumed_text:${requestId}`;
    }

    // Save parent state in the stack before calling the subagent
    async push(requestId, snapshot) {
        const key = this.stackKey(requestId);
        await this.tdCache.lPush(key, JSON.stringify(snapshot));
        await this.tdCache.expire(key, 60 * 60 * 24); // 24 hours
    }

    // Restore parent state from the stack after the subagent return
    async pop(requestId) {
        const key = this.stackKey(requestId);
        const value = await this.tdCache.lPop(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    // Look at the top of the stack without removing it
    async peek(requestId) {
        const key = this.stackKey(requestId);
        const value = await this.tdCache.lIndex(key, 0);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    // Number of elements in the stack
    async size(requestId) {
        const key = this.stackKey(requestId);
        const size = await this.tdCache.lLen(key);
        return size;
    }

    // Clear the stack
    async clear(requestId) {
        const key = this.stackKey(requestId);
        await this.tdCache.del(key);
    }

    // Remember the user text that opened the subagent, so a re-delivery
    // after the parent is restored is not interpreted as a new turn.
    async markTriggerMessageConsumed(requestId, text) {
        if (!text) {
            return;
        }
        await this.tdCache.set(
            this.consumedMessageKey(requestId),
            text,
            { EX: SubagentStack.CONSUMED_MESSAGE_TTL_SECONDS }
        );
    }

    async getConsumedTriggerMessage(requestId) {
        return await this.tdCache.get(this.consumedMessageKey(requestId));
    }

    async clearConsumedTriggerMessage(requestId) {
        await this.tdCache.del(this.consumedMessageKey(requestId));
    }
    
}

module.exports = { SubagentStack };