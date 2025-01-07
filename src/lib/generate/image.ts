import { Canvas, createCanvas, Image, PNGStream } from "canvas";
import { CanvasRenderingContext2D } from "canvas";

type TextRobotType = {
	content: string;
	robotImage: Image;
}

type RobotBaseType = {
	canvas: Canvas;
	context: CanvasRenderingContext2D;
	robotImage: Image;
}

const fontSize = 90;
const fontStyle = '"GenJyuuGothic-Normal", sans-serif'

function adjustTexts(context: CanvasRenderingContext2D, texts: string[], width: number, height: number, followWidth?: number, optionFontSize?: number) {
	const targetFontSize = optionFontSize ?? fontSize;
	const maxLineWidth = Math.max(...texts.map(text => context.measureText(text).width));
	console.log(maxLineWidth);
	const formatTextSize = () => {
		let size = targetFontSize;
		console.log(size)
		if (maxLineWidth > width * 0.9) {
			size = (width * 0.9 / maxLineWidth) * targetFontSize;
			console.log("te")
			console.log(size)
		}
		if (texts.length * size > 400) {
			size = 400 / texts.length * 0.9;
			console.log(size)
		}
		return size;
	}
	const formatSize = formatTextSize();
	console.log(formatSize);
	context.font = `${formatSize}px ${fontStyle}`;
	for (let i = 0; i < texts.length; i++) {
		context.fillText(texts[i], (followWidth ?? 0) + (width - context.measureText(texts[i]).width) / 2, (height - formatSize * texts.length / 2) + i * formatSize);
	}
	context.font = `${targetFontSize}px ${fontStyle}`;
}


function generateRobotBase({ canvas, context, robotImage }: RobotBaseType) {
	context.fillStyle = 'rgb( 255, 255, 255)';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(robotImage, 0, 0, canvas.width, canvas.height);
	context.font = `${fontSize}px ${fontStyle}`;
	context.fillStyle = 'black';
}

function GenerateRobotText({ content, robotImage }: TextRobotType): PNGStream {
	const canvas = createCanvas(robotImage.width, robotImage.height);
	const context = canvas.getContext('2d');
	generateRobotBase({ canvas, context, robotImage });
	adjustTexts(context, content.split('\\n'), 1000, 430, 750);
	return canvas.createPNGStream();
}

export { GenerateRobotText }
