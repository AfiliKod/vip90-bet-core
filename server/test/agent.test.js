import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Agent from '../src/models/Agent.js';
import Transaction from '../src/models/Transaction.js';
import { createAgent, assignPlayerToAgent, removePlayerFromAgent, transferFundsAgentToPlayer, getAgentPlayers, getAgentStats, getAllAgents, updateAgent, getAgentByUserId, payAgentCommission } from '../src/services/agent.js';

describe('Agent System', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_agent');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Agent.deleteMany({});
    await Transaction.deleteMany({});
  });

  describe('createAgent', () => {
    it('should create a new agent from a user', async () => {
      const user = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(user._id, admin._id, { commissionRate: 15, notes: 'Test agent' });

      assert.ok(agent);
      assert.ok(agent._id);
      assert.equal(agent.userId.toString(), user._id.toString());
      assert.equal(agent.commissionRate, 15);
      assert.equal(agent.balance, 0);
      assert.equal(agent.isActive, true);
      assert.equal(agent.notes, 'Test agent');
      assert.equal(agent.registeredBy.toString(), admin._id.toString());

      // Check user updated
      const updatedUser = await User.findById(user._id);
      assert.equal(updatedUser.isAgent, true);
      assert.ok(updatedUser.agentId.equals(agent._id));
    });

    it('should throw error if user is already an agent', async () => {
      const user = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
        isAgent: true,
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await createAgent(user._id, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already an agent'));
      }
    });

    it('should throw error for non-existent user', async () => {
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await createAgent(new mongoose.Types.ObjectId(), admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('not found'));
      }
    });
  });

  describe('assignPlayerToAgent', () => {
    it('should assign a player to an agent', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.players.length, 1);
      assert.ok(updatedAgent.players[0].equals(player._id));

      const updatedPlayer = await User.findById(player._id);
      assert.ok(updatedPlayer.agentId.equals(agent._id));
    });

    it('should throw error if player already assigned to another agent', async () => {
      const agentUser1 = await User.create({
        username: 'agentuser1',
        email: 'agent1@example.com',
        password: 'password123',
      });

      const agentUser2 = await User.create({
        username: 'agentuser2',
        email: 'agent2@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent1 = await createAgent(agentUser1._id, admin._id);
      const agent2 = await createAgent(agentUser2._id, admin._id);

      await assignPlayerToAgent(player._id, agent1._id, admin._id);

      try {
        await assignPlayerToAgent(player._id, agent2._id, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('another agent'));
      }
    });

    it('should not duplicate assignment', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id); // Duplicate

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.players.length, 1);
    });
  });

  describe('removePlayerFromAgent', () => {
    it('should remove player from agent', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);
      await removePlayerFromAgent(player._id, agent._id);

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.players.length, 0);

      const updatedPlayer = await User.findById(player._id);
      assert.equal(updatedPlayer.agentId, null);
    });
  });

  describe('transferFundsAgentToPlayer', () => {
    it('should transfer funds from agent to player with dual transaction records', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);

      // Fund agent first
      agent.balance = 1000;
      await agent.save();

      const result = await transferFundsAgentToPlayer(agentUser._id, player._id, 100, 'Test transfer');

      assert.ok(result.transferId);
      assert.ok(result.agentTransaction);
      assert.ok(result.playerTransaction);

      // Check agent transaction (outgoing)
      assert.equal(result.agentTransaction.type, 'agent_transfer_out');
      assert.equal(result.agentTransaction.amount, -100);
      assert.equal(result.agentTransaction.balanceBefore, 1000);
      assert.equal(result.agentTransaction.balanceAfter, 900);
      assert.equal(result.agentTransaction.referenceId.toString(), result.transferId.toString());

      // Check player transaction (incoming)
      assert.equal(result.playerTransaction.type, 'agent_transfer_in');
      assert.equal(result.playerTransaction.amount, 100);
      assert.equal(result.playerTransaction.balanceBefore, 0);
      assert.equal(result.playerTransaction.balanceAfter, 100);
      assert.equal(result.playerTransaction.referenceId.toString(), result.transferId.toString());

      // Check balances
      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.balance, 900);

      const updatedPlayer = await User.findById(player._id);
      assert.equal(updatedPlayer.balance, 100);

      // Both transactions should exist
      const transactions = await Transaction.find({ referenceId: result.transferId });
      assert.equal(transactions.length, 2);
    });

    it('should throw error if agent has insufficient balance', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);
      // Agent balance is 0

      try {
        await transferFundsAgentToPlayer(agentUser._id, player._id, 100, 'Test transfer');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('insufficient balance'));
      }
    });

    it('should throw error if player not owned by agent', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      // Don't assign player to agent

      agent.balance = 1000;
      await agent.save();

      try {
        await transferFundsAgentToPlayer(agentUser._id, player._id, 100, 'Test transfer');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('not owned'));
      }
    });
  });

  describe('getAgentPlayers', () => {
    it('should return paginated agent players', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);

      // Create multiple players
      for (let i = 1; i <= 5; i++) {
        const player = await User.create({
          username: `player${i}`,
          email: `player${i}@example.com`,
          password: 'password123',
        });
        await assignPlayerToAgent(player._id, agent._id, admin._id);
      }

      const result = await getAgentPlayers(agentUser._id, { page: 1, limit: 2 });
      assert.equal(result.players.length, 2);
      assert.equal(result.total, 5);
      assert.equal(result.pages, 3);
    });

    it('should filter players by search', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);

      const player1 = await User.create({
        username: 'john',
        email: 'john@example.com',
        password: 'password123',
      });
      const player2 = await User.create({
        username: 'jane',
        email: 'jane@example.com',
        password: 'password123',
      });

      await assignPlayerToAgent(player1._id, agent._id, admin._id);
      await assignPlayerToAgent(player2._id, agent._id, admin._id);

      const result = await getAgentPlayers(agentUser._id, { search: 'john' });
      assert.equal(result.players.length, 1);
      assert.equal(result.players[0].username, 'john');
    });
  });

  describe('getAgentStats', () => {
    it('should return agent statistics', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player1 = await User.create({
        username: 'player1',
        email: 'player1@example.com',
        password: 'password123',
        balance: 100,
      });

      const player2 = await User.create({
        username: 'player2',
        email: 'player2@example.com',
        password: 'password123',
        balance: 200,
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id, { commissionRate: 15 });
      await assignPlayerToAgent(player1._id, agent._id, admin._id);
      await assignPlayerToAgent(player2._id, agent._id, admin._id);

      agent.balance = 500;
      await agent.save();

      const stats = await getAgentStats(agentUser._id);

      assert.equal(stats.agentBalance, 500);
      assert.equal(stats.commissionRate, 15);
      assert.equal(stats.playerCount, 2);
      assert.equal(stats.totalPlayerBalance, 300);
      assert.equal(stats.isActive, true);
    });
  });

  describe('getAllAgents', () => {
    it('should return paginated agents with populated users', async () => {
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      for (let i = 1; i <= 3; i++) {
        const agentUser = await User.create({
          username: `agent${i}`,
          email: `agent${i}@example.com`,
          password: 'password123',
        });
        await createAgent(agentUser._id, admin._id);
      }

      const result = await getAllAgents({ page: 1, limit: 2 });
      assert.equal(result.agents.length, 2);
      assert.equal(result.total, 3);
      assert.equal(result.pages, 2);
      assert.ok(result.agents[0].userId.username);
    });

    it('should filter by status', async () => {
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agentUser1 = await User.create({
        username: 'agent1',
        email: 'agent1@example.com',
        password: 'password123',
      });
      const agentUser2 = await User.create({
        username: 'agent2',
        email: 'agent2@example.com',
        password: 'password123',
      });

      const agent1 = await createAgent(agentUser1._id, admin._id);
      const agent2 = await createAgent(agentUser2._id, admin._id);

      // Deactivate agent2
      await Agent.findByIdAndUpdate(agent2._id, { isActive: false });

      const activeAgents = await getAllAgents({ status: 'active' });
      assert.equal(activeAgents.total, 1);
      assert.equal(activeAgents.agents[0].userId.username, 'agent1');

      const inactiveAgents = await getAllAgents({ status: 'inactive' });
      assert.equal(inactiveAgents.total, 1);
      assert.equal(inactiveAgents.agents[0].userId.username, 'agent2');
    });
  });

  describe('updateAgent', () => {
    it('should update agent settings', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id, { commissionRate: 10 });
      await updateAgent(agent._id, { commissionRate: 20, notes: 'Updated' });

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.commissionRate, 20);
      assert.equal(updatedAgent.notes, 'Updated');
    });

    it('should not update disallowed fields', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await updateAgent(agent._id, { balance: 999999, userId: new mongoose.Types.ObjectId() });

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.balance, 0); // Should not change
    });
  });

  describe('payAgentCommission', () => {
    it('should pay commission to agent from player losses', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id, { commissionRate: 10 });
      await assignPlayerToAgent(player._id, agent._id, admin._id);

      const result = await payAgentCommission(player._id, 1000); // 10% = 100

      assert.ok(result);
      assert.equal(result.commission, 100);

      const updatedAgent = await Agent.findById(agent._id);
      assert.equal(updatedAgent.balance, 100);

      const tx = await Transaction.findOne({ userId: agentUser._id, type: 'agent_commission' });
      assert.ok(tx);
      assert.equal(tx.amount, 100);
    });

    it('should return null if player has no agent', async () => {
      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const result = await payAgentCommission(player._id, 1000);
      assert.equal(result, null);
    });

    it('should return null if agent is inactive', async () => {
      const agentUser = await User.create({
        username: 'agentuser',
        email: 'agent@example.com',
        password: 'password123',
      });

      const player = await User.create({
        username: 'player',
        email: 'player@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const agent = await createAgent(agentUser._id, admin._id);
      await assignPlayerToAgent(player._id, agent._id, admin._id);
      await Agent.findByIdAndUpdate(agent._id, { isActive: false });

      const result = await payAgentCommission(player._id, 1000);
      assert.equal(result, null);
    });
  });
});