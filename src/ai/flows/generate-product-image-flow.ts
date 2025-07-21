'use server';
/**
 * @fileOverview A flow to generate a product image using AI.
 *
 * - generateProductImage - Generates an image based on a product name.
 */
import {ai} from '@/ai/genkit';
import {z} from 'zod';

const GenerateProductImageInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
});
type GenerateProductImageInput = z.infer<
  typeof GenerateProductImageInputSchema
>;

const GenerateProductImageOutputSchema = z.object({
  imageUrl: z
    .string()
    .describe('The data URI of the generated product image.'),
});
type GenerateProductImageOutput = z.infer<
  typeof GenerateProductImageOutputSchema
>;

export async function generateProductImage(
  input: GenerateProductImageInput
): Promise<GenerateProductImageOutput> {
  return generateProductImageFlow(input);
}

const generateProductImageFlow = ai.defineFlow(
  {
    name: 'generateProductImageFlow',
    inputSchema: GenerateProductImageInputSchema,
    outputSchema: GenerateProductImageOutputSchema,
  },
  async input => {
    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview-image-generation',
      prompt: `Generate a photorealistic image of the following product, on a clean white background: ${input.productName}`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    if (!media.url) {
      throw new Error('Image generation failed.');
    }

    return {
      imageUrl: media.url,
    };
  }
);
