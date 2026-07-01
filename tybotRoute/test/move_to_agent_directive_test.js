var assert = require('assert');
const { promisify } = require('util');
const { DirMoveToAgent } = require('../tiledeskChatbotPlugs/directives/DirMoveToAgent');

describe('Directive DirMoveToAgent', function() {

  function createMockTdClient() {
    return {
      moveToAgentCalled: false,
      moveToAgentRequestId: null,
      getAllDepartmentsCalled: false,
      updateRequestDepartmentCalled: false,
      updateRequestDepartmentDepId: null,
      moveToAgent(requestId, callback) {
        this.moveToAgentCalled = true;
        this.moveToAgentRequestId = requestId;
        callback(null);
      },
      getAllDepartments(callback) {
        this.getAllDepartmentsCalled = true;
        callback(null, [
          {
            _id: "dep-support-id",
            name: "Support"
          },
          {
            _id: "dep-sales-id",
            name: "Sales"
          }
        ]);
      },
      updateRequestDepartment(requestId, depId, options, callback) {
        this.updateRequestDepartmentCalled = true;
        this.updateRequestDepartmentDepId = depId;
        callback(null, { success: true });
      }
    };
  }

  function createDir(mockTdClient) {
    const dir = new DirMoveToAgent({
      projectId: "projectID",
      API_ENDPOINT: "http://localhost:10002",
      token: "XXX",
      requestId: "support-group-projectID-abc123",
      tdcache: null
    });
    dir.tdClient = mockTdClient;
    return dir;
  }

  it('calls moveToAgent only when departmentId is not set', async function() {
    const mockTdClient = createMockTdClient();
    const dir = createDir(mockTdClient);
    const action = {
      _tdActionType: "agent",
      _tdActionId: "22222222-2222-2222-2222-222222222222"
    };
    const executeAsync = promisify(dir.execute).bind(dir);
    await executeAsync({ action: action });

    assert.strictEqual(mockTdClient.moveToAgentCalled, true);
    assert.strictEqual(mockTdClient.moveToAgentRequestId, "support-group-projectID-abc123");
    assert.strictEqual(mockTdClient.getAllDepartmentsCalled, false);
    assert.strictEqual(mockTdClient.updateRequestDepartmentCalled, false);
  });

  it('calls moveToAgent and moveToDepartment when departmentId is set', async function() {
    const mockTdClient = createMockTdClient();
    const dir = createDir(mockTdClient);
    const action = {
      _tdActionType: "agent",
      _tdActionId: "44444444-4444-4444-4444-444444444444",
      departmentId: "Support"
    };
    const executeAsync = promisify(dir.execute).bind(dir);
    await executeAsync({ action: action });

    assert.strictEqual(mockTdClient.moveToAgentCalled, true);
    assert.strictEqual(mockTdClient.moveToAgentRequestId, "support-group-projectID-abc123");
    assert.strictEqual(mockTdClient.getAllDepartmentsCalled, true);
    assert.strictEqual(mockTdClient.updateRequestDepartmentCalled, true);
    assert.strictEqual(mockTdClient.updateRequestDepartmentDepId, "dep-support-id");
  });

});
