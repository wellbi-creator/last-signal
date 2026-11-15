import Phaser from 'phaser';
import { APP_NAME, APP_VERSION, COLORS } from '../config.ts';
import { Rng } from '../core/Rng.ts';
import { isTouchDevice } from '../platform.ts';
import { getCore } from './coreAccess.ts';
import { SCENE_KEYS } from './keys.ts';

/**
 * Экран M0 (каркас). Настоящее главное меню (новый мир, загрузка, настройки) появится на этапе M6,
 * поэтому кнопок здесь намеренно нет, чтобы не оставлять неработающих элементов.
 * Экран нужен для проверки каркаса на реальных устройствах:
 * - числа демо-генератора должны совпасть на ПК и iPhone (проверка детерминизма);
 * - строка «касаний» показывает, что мультитач работает (нужно для джойстика и кнопок);
 * - размер экрана обновляется при повороте устройства и изменении окна.
 */
export class MainMenuScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private probeText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.MainMenu);
  }

  create(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const make = (color: string): Phaser.GameObjects.Text =>
      this.add
        .text(0, 0, '', { fontFamily: 'monospace', color, align: 'center' })
        .setOrigin(0.5)
        .setResolution(dpr);

    this.titleText = make(COLORS.accent).setText(APP_NAME.toUpperCase());
    this.subtitleText = make(COLORS.text).setText(`Каркас M0 · версия ${APP_VERSION}`);
    this.infoText = make(COLORS.textDim);
    this.probeText = make(COLORS.text).setText('Коснитесь экрана или нажмите кнопку мыши');

    this.refreshInfo();
    this.layout();

    this.input.addPointer(2); // до 3 одновременных касаний (джойстик + кнопки)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.updateProbe, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.updateProbe, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.updateProbe, this);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private onResize(): void {
    this.refreshInfo();
    this.layout();
  }

  private refreshInfo(): void {
    const core = getCore(this);
    // Демонстрация детерминизма: при одинаковом seed числа одинаковы на любом устройстве.
    const demo = Rng.fromText(core.state.worldSeed).child(0);
    const numbers = [demo.int(1, 99), demo.int(1, 99), demo.int(1, 99)].join(' ');
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    this.infoText.setText(
      [
        `Rng(${core.state.worldSeed}): ${numbers}`,
        `Рендер: ${renderer} · экран: ${this.scale.width}×${this.scale.height}`,
        `Касание: ${isTouchDevice() ? 'да' : 'нет'} · DPR: ${window.devicePixelRatio || 1}`,
      ].join('\n'),
    );
  }

  private updateProbe(pointer: Phaser.Input.Pointer): void {
    const down = this.input.manager.pointers.filter((p) => p.isDown).length;
    this.probeText.setText(
      `Указатель: ${Math.round(pointer.x)}, ${Math.round(pointer.y)} · нажато: ${down}`,
    );
  }

  private layout(): void {
    const { width, height } = this.scale;
    const unit = Math.max(12, Math.round(Math.min(width, height) / 32));
    const cx = width / 2;
    const cy = height / 2;
    this.titleText.setFontSize(unit * 2.2).setPosition(cx, cy - unit * 5);
    this.subtitleText.setFontSize(unit).setPosition(cx, cy - unit * 2.5);
    this.infoText
      .setFontSize(unit * 0.8)
      .setLineSpacing(unit * 0.4)
      .setPosition(cx, cy + unit * 1.5);
    this.probeText.setFontSize(unit * 0.8).setPosition(cx, cy + unit * 6);
    // Длинные строки не должны выходить за край узкого экрана телефона.
    const wrapWidth = Math.max(120, width - unit * 2);
    for (const text of [this.subtitleText, this.infoText, this.probeText]) {
      text.setWordWrapWidth(wrapWidth, true);
    }
  }
}
