import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import LoginAttempt from '../models/LoginAttempt.js';
import KycDocument from '../models/KycDocument.js';
import { createSignal, SIGNAL_CODES } from './riskSignal.js';

export async function onDeposit(playerId, depositData) {
  const { amount, brandId, jurisdictionId } = depositData;
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recentDeposits = await Transaction.countDocuments({
    userId: playerId,
    type: 'deposit',
    createdAt: { $gte: oneHourAgo },
  });

  if (recentDeposits >= 5) {
    await createSignal(playerId, SIGNAL_CODES.HIGH_DEPOSIT_VELOCITY, {
      brandId, jurisdictionId,
      description: `${recentDeposits} deposits in the last hour`,
      sourceEvent: 'player.deposit',
      eventData: { amount, count: recentDeposits },
    });
  }

  if (recentDeposits >= 3) {
    await createSignal(playerId, SIGNAL_CODES.DEPOSIT_VELOCITY_SPIKE, {
      brandId, jurisdictionId,
      description: `${recentDeposits} deposits in the last hour`,
      sourceEvent: 'player.deposit',
      eventData: { amount, count: recentDeposits },
    });
  }
}

export async function onWithdrawal(playerId, withdrawalData) {
  const { amount, brandId, jurisdictionId } = withdrawalData;
  const lastDeposit = await Transaction.findOne({
    userId: playerId,
    type: 'deposit',
  }).sort({ createdAt: -1 });

  if (lastDeposit) {
    const diffMs = Date.now() - new Date(lastDeposit.createdAt).getTime();
    const minutesSinceDeposit = Math.floor(diffMs / 60000);
    if (minutesSinceDeposit <= 10) {
      await createSignal(playerId, SIGNAL_CODES.RAPID_WITHDRAWAL_AFTER_DEPOSIT, {
        brandId, jurisdictionId,
        description: `Withdrawal ${minutesSinceDeposit} minutes after deposit`,
        sourceEvent: 'player.withdrawal',
        eventData: { amount, minutesSinceDeposit, depositAmount: lastDeposit.amount },
      });
    }
  }

  const oneHourAgo = new Date(Date.now() - 3600000);
  const failedWithdrawals = await Transaction.countDocuments({
    userId: playerId,
    type: 'withdraw',
    status: 'failed',
    createdAt: { $gte: oneHourAgo },
  });

  if (failedWithdrawals >= 3) {
    await createSignal(playerId, SIGNAL_CODES.WITHDRAWAL_FAILURES, {
      brandId, jurisdictionId,
      description: `${failedWithdrawals} failed withdrawals in the last hour`,
      sourceEvent: 'player.withdrawal',
      eventData: { amount, failedCount: failedWithdrawals },
    });
  }
}

export async function onFailedLogin(playerId, loginData) {
  const { ip, brandId, jurisdictionId } = loginData;
  const oneHourAgo = new Date(Date.now() - 3600000);
  const failedAttempts = await LoginAttempt.countDocuments({
    userId: playerId,
    success: false,
    createdAt: { $gte: oneHourAgo },
  });

  if (failedAttempts >= 5) {
    await createSignal(playerId, SIGNAL_CODES.REPEATED_FAILED_LOGIN, {
      brandId, jurisdictionId,
      description: `${failedAttempts} failed login attempts in the last hour`,
      sourceEvent: 'player.login',
      eventData: { ip, failedAttempts },
    });
  }
}

export async function onKycFailure(playerId, kycData) {
  const { brandId, jurisdictionId } = kycData;
  const totalFailures = await KycDocument.countDocuments({
    userId: playerId,
    status: 'rejected',
  });

  if (totalFailures >= 3) {
    await createSignal(playerId, SIGNAL_CODES.KYC_FAILURES, {
      brandId, jurisdictionId,
      description: `${totalFailures} total KYC failures`,
      sourceEvent: 'player.kyc_result',
      eventData: { totalFailures },
    });
  }
}

export async function onAccountChange(playerId, changeData) {
  const { type, brandId, jurisdictionId } = changeData;
  const sensitiveChanges = ['email', 'password', 'phone', 'kyc'];
  if (sensitiveChanges.includes(type)) {
    await createSignal(playerId, SIGNAL_CODES.SUSPICIOUS_ACCOUNT_CHANGE, {
      brandId, jurisdictionId,
      description: `Sensitive account change: ${type}`,
      sourceEvent: 'player.account_change',
      eventData: { changeType: type },
    });
  }
}

export async function onPlayerBet(playerId, betData) {
  const { amount, brandId, jurisdictionId } = betData;
  await createSignal(playerId, SIGNAL_CODES.PLAYER_BET, {
    brandId, jurisdictionId,
    description: 'Bet placed',
    sourceEvent: 'player.bet',
    eventData: { amount },
  });
}

export async function onGameRound(playerId, roundData) {
  const { gameId, brandId, jurisdictionId } = roundData;
  await createSignal(playerId, SIGNAL_CODES.PLAYER_GAME_ROUND, {
    brandId, jurisdictionId,
    description: 'Game round started',
    sourceEvent: 'player.game_round',
    eventData: { gameId },
  });
}
