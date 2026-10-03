/**
 * 交易行处理函数（纯单机模式）
 * NPC 货源由 auctionService.generateMarketItems 按境界程序化生成，
 * 玩家上架/下架/购买全部本地结算（原联机 API 模式已随账号层一并剥离）。
 */

import type { PlayerStats, MarketItem } from '../../types';
import { useGameStore, useUIStore } from '../../store';
import { createPlayerListing, restoreFromListing, generateMarketItems } from '../../services/auctionService';
import { addItemToInventory } from '../../utils/inventoryUtils';

interface UseTradeMarketHandlersProps {
  player?: PlayerStats;
  setPlayer?: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog?: (message: string, type?: string) => void;
  setIsTradeMarketOpen?: (open: boolean) => void;
}

export function useTradeMarketHandlers(
  props?: UseTradeMarketHandlersProps
) {
  const storePlayer = useGameStore((state) => state.player);
  const storeSetPlayer = useGameStore((state) => state.setPlayer);
  const storeAddLog = useGameStore((state) => state.addLog);
  const storeSetModal = useUIStore((state) => state.setModal);
  const storeSetMarketItems = useUIStore((state) => state.setMarketItems);

  const player = props?.player ?? storePlayer;
  const setPlayer = props?.setPlayer ?? storeSetPlayer;
  const addLog = props?.addLog ?? storeAddLog;
  const setIsTradeMarketOpen = props?.setIsTradeMarketOpen ??
    ((open: boolean) => storeSetModal('isTradeMarketOpen', open));

  const getItems = () => useUIStore.getState().marketItems;
  const setItems = (items: MarketItem[]) => storeSetMarketItems(items);

  /** 获取玩家自己的上架物品（本地） */
  const getPlayerListings = (): MarketItem[] => getItems().filter((i) => i.sellerId === 'player');

  /** 生成一批 NPC 货源并合入本地上架（单机市场货源） */
  const restockMarket = (p: PlayerStats) => {
    setItems([...generateMarketItems(p), ...getPlayerListings()]);
  };

  /** 打开交易行：补一批 NPC 货源 */
  const handleOpenTradeMarket = async () => {
    if (!player) return;
    restockMarket(player);
  };

  /** 刷新商品（消耗灵石，重掷 NPC 货源） */
  const handleRefresh = async () => {
    if (!player) return;

    const refreshCost = Math.floor(500 + Math.max(0, player.spiritStones * 0.01));
    if (player.spiritStones < refreshCost) {
      addLog(`灵石不足！刷新需要 ${refreshCost} 灵石。`, 'danger');
      return;
    }

    setPlayer((prev) => {
      if (!prev) return prev;
      return { ...prev, spiritStones: prev.spiritStones - refreshCost };
    });

    // 刷新时重置到第一页
    restockMarket(player);
    addLog(`你花费 ${refreshCost} 灵石刷新了交易行。`, 'gain');
  };

  /** 购买物品：联机先服务端确认再对齐本地，避免双扣/双发 */
  const applyPurchasedItem = (target: PlayerStats, marketItem: MarketItem): PlayerStats => ({
    ...target,
    spiritStones: Math.max(0, (Number(target.spiritStones) || 0) - marketItem.price),
    inventory: addItemToInventory(
      target.inventory,
      {
        name: marketItem.name, type: marketItem.type, description: marketItem.description,
        rarity: marketItem.rarity, isEquippable: marketItem.isEquippable,
        equipmentSlot: marketItem.equipmentSlot, effect: marketItem.effect,
        advancedItemType: marketItem.advancedItemType,
        advancedItemId: marketItem.advancedItemId,
      },
      marketItem.quantity || 1,
      { realm: target.realm, realmLevel: target.realmLevel }
    ),
  });

  const handlePurchase = async (itemId: string) => {
    if (!player) return;

    const items = getItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      addLog('该商品不存在或已被买走。', 'danger');
      return;
    }

    if (item.sellerId === 'player') {
      addLog('不能购买自己上架的物品。', 'danger');
      return;
    }

    if (player.spiritStones < item.price) {
      addLog(`灵石不足！需要 ${item.price} 灵石。`, 'danger');
      return;
    }

    setPlayer((prev) => (prev ? applyPurchasedItem(prev, item) : prev));
    setItems(items.filter((i) => i.id !== itemId));
    addLog(`你以 ${item.price} 灵石购得了【${item.name}】！`, 'special');
  };

  /** 玩家上架自己的物品 */
  const handleListItem = async (itemId: string, price: number, quantity: number = 1) => {
    if (!player || price <= 0) return;

    const inventory = player.inventory;
    const sourceItem = inventory.find((i) => i.id === itemId);
    if (!sourceItem) { addLog('背包中找不到该物品。', 'danger'); return; }
    if (sourceItem.locked) { addLog(`【${sourceItem.name}】已锁定，无法上架。`, 'danger'); return; }
    const listingQuantity = Math.floor(Number(quantity) || 0);
    if (listingQuantity < 1 || listingQuantity > (sourceItem.quantity || 1)) {
      addLog(`上架数量需在 1-${sourceItem.quantity || 1} 之间。`, 'danger');
      return;
    }

    const isEquipped = Object.values(player.equippedItems).includes(sourceItem.id);
    if (isEquipped) { addLog('已装备的物品无法上架！', 'danger'); return; }

    const listing = createPlayerListing(sourceItem, price, listingQuantity);

    // 从背包移除（本地即时）
    setPlayer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        inventory: prev.inventory
          .map((i) => (i.id === itemId ? { ...i, quantity: (i.quantity || 1) - listingQuantity } : i))
          .filter((i) => i.quantity > 0),
      };
    });

    // 添加到交易行
    setItems([...getItems(), listing]);
    addLog(`你成功将【${sourceItem.name}】x${listingQuantity} 上架，售价 ${price} 灵石。`, 'gain');
  };

  /** 玩家下架自己的物品 */
  const handleCancelListing = async (marketItemId: string) => {
    const items = getItems();
    const listing = items.find((i) => i.id === marketItemId && i.sellerId === 'player');
    if (!listing) { addLog('找不到该上架记录。', 'danger'); return; }

    const restored = restoreFromListing(listing);

    setPlayer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        inventory: addItemToInventory(prev.inventory, restored, restored.quantity || 1, {
          realm: prev.realm, realmLevel: prev.realmLevel,
        }),
      };
    });

    setItems(items.filter((i) => i.id !== marketItemId));
    addLog(`已将【${listing.name}】从交易行下架，放回背包。`, 'normal');
  };

  /** 免费同步市场数据（购买tab切换时自动调用）；单机版市场无 NPC 货物时自动补货 */
  const handleSyncMarket = async () => {
    if (!player) return;
    const npcItems = getItems().filter((i) => i.sellerId !== 'player');
    if (npcItems.length === 0) {
      restockMarket(player);
    }
  };

  /** 领取交易行出售收益（单机模式无服务端结算，保留接口为空实现） */
  const claimPayouts = async () => {};

  return {
    handleOpenTradeMarket,
    handlePurchase,
    handleRefresh,
    handleSyncMarket,
    handleListItem,
    handleCancelListing,
    getPlayerListings,
    claimPayouts,
    setIsTradeMarketOpen,
  };
}
