import {
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Body,
  UseGuards,
  Param,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from 'src/user/dto/create-user.dto/create-user.dto';
import { User } from 'src/user/entities/user/user.entity';
import { UserService } from 'src/user/services/user/user.service';
import { AuthGuard } from '@nestjs/passport';
import { UpdateUserDto } from 'src/user/dto/update-user.dto/update-user.dto';
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get all users' })
  findAll(): Promise<User[]> {
    try {
      return this.userService.findAllUsers();
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get a user by id' })
  findById(@Param('id', ParseIntPipe) id: number): Promise<User | null> {
    try {
      return this.userService.findUserById(id);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new user' })
  create(@Body() user: CreateUserDto): Promise<User> {
    try {
      return this.userService.createUser(user);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Put(':id')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update a user' })
  update(@Body() user: UpdateUserDto, @Param('id') id: number): Promise<User> {
    try {
      return this.userService.updateUser(id, user);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
