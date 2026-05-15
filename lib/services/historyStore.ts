import { getRedis } from '../redis';
import type { DailyUsage, ServiceId, ServiceUsage } from '../types';

/**
 * 서비스별 일별 히스토리를 Redis에 영구적으로 누적 저장합니다.
 * 기존 로직을 건드리지 않고 '추가'만 하는 방식입니다.
 */

const HISTORY_KEY_PREFIX = 'usage:history:v1';

export async function saveServiceHistory(serviceId: ServiceId, dailyHistory: DailyUsage[]) {
  const redis = getRedis();
  const key = `${HISTORY_KEY_PREFIX}:${serviceId}`;

  try {
    // 1. 기존 저장된 히스토리 가져오기
    const existingData = await redis.get(key);
    const historyMap = new Map<string, DailyUsage>();

    if (Array.isArray(existingData)) {
      existingData.forEach((item: DailyUsage) => historyMap.set(item.date, item));
    }

    // 2. 새로운 데이터로 업데이트 또는 추가
    dailyHistory.forEach((item) => {
      // 데이터가 0이 아닌 경우에만 의미 있는 업데이트로 간주
      if (item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0 || item.cost > 0) {
        historyMap.set(item.date, item);
      }
    });

    // 3. 날짜순 정렬 후 다시 저장
    const updatedHistory = Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    
    // 최대 500일치 데이터 유지 (데이터가 너무 커지는 것 방지)
    const trimmedHistory = updatedHistory.slice(-500);
    
    await redis.set(key, trimmedHistory);
    return true;
  } catch (error) {
    console.error(`[HistoryStore] Failed to save history for ${serviceId}:`, error);
    return false;
  }
}

export async function mergeWithStoredHistory(serviceUsage: ServiceUsage): Promise<ServiceUsage> {
  const redis = getRedis();
  const key = `${HISTORY_KEY_PREFIX}:${serviceUsage.service}`;

  try {
    const storedHistory = await redis.get(key);
    if (!Array.isArray(storedHistory) || storedHistory.length === 0) {
      // 저장된 히스토리가 없으면 현재 데이터라도 저장 시도 (백그라운드)
      if (serviceUsage.dailyHistory.length > 0) {
        void saveServiceHistory(serviceUsage.service, serviceUsage.dailyHistory);
      }
      return serviceUsage;
    }

    const historyMap = new Map<string, DailyUsage>();

    // 1. 저장된 과거 데이터 먼저 채우기
    storedHistory.forEach((item: DailyUsage) => historyMap.set(item.date, item));

    // 2. 실시간으로 가져온 최신 데이터 덮어쓰기 (실시간 데이터가 더 정확하므로)
    serviceUsage.dailyHistory.forEach((item) => historyMap.set(item.date, item));

    // 3. 새로운 결과가 생겼으니 다시 저장 (백그라운드)
    const mergedHistory = Array.from(historyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    void saveServiceHistory(serviceUsage.service, mergedHistory);

    // 4. 결과 반환
    return {
      ...serviceUsage,
      dailyHistory: mergedHistory,
    };
  } catch (error) {
    console.error(`[HistoryStore] Failed to merge history for ${serviceUsage.service}:`, error);
    return serviceUsage;
  }
}
